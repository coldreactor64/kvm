package usbgadget

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

var gamepadConfig = gadgetConfigItem{
	order:      1003,
	device:     "hid.usb3",
	path:       []string{"functions", "hid.usb3"},
	configPath: []string{"hid.usb3"},
	attrs: gadgetAttributes{
		"protocol":        "0",
		"subclass":        "0",
		"report_length":   "8",
		"no_out_endpoint": "1",
	},
	reportDesc: gamepadReportDesc,
}

// Gamepad HID Report Descriptor
// Standard gamepad layout compatible with most systems:
// - 2 analog sticks (left: X/Y, right: Rx/Ry) - 8-bit each (0-255, 128 center)
// - D-pad as Hat Switch (8 directions + center)
// - 16 buttons
// - 2 triggers (Z/Rz) - 8-bit each (0-255)
//
// Report format (8 bytes):
// Byte 0: Left stick X (0-255, 128 = center)
// Byte 1: Left stick Y (0-255, 128 = center)
// Byte 2: Right stick X (0-255, 128 = center)
// Byte 3: Right stick Y (0-255, 128 = center)
// Byte 4: Left trigger (0-255) / Hat switch (low nibble: 0-8)
// Byte 5: Right trigger (0-255)
// Byte 6: Buttons 1-8 (A, B, X, Y, LB, RB, Back, Start)
// Byte 7: Buttons 9-16 (L3, R3, Guide, and 5 reserved)
var gamepadReportDesc = []byte{
	0x05, 0x01, // USAGE_PAGE (Generic Desktop)
	0x09, 0x05, // USAGE (Game Pad)
	0xA1, 0x01, // COLLECTION (Application)

	// Left Analog Stick
	0x09, 0x01, //   USAGE (Pointer)
	0xA1, 0x00, //   COLLECTION (Physical)
	0x09, 0x30, //     USAGE (X)
	0x09, 0x31, //     USAGE (Y)
	0x15, 0x00, //     LOGICAL_MINIMUM (0)
	0x26, 0xFF, 0x00, // LOGICAL_MAXIMUM (255)
	0x75, 0x08, //     REPORT_SIZE (8)
	0x95, 0x02, //     REPORT_COUNT (2)
	0x81, 0x02, //     INPUT (Data,Var,Abs)
	0xC0, //   END_COLLECTION

	// Right Analog Stick
	0x09, 0x01, //   USAGE (Pointer)
	0xA1, 0x00, //   COLLECTION (Physical)
	0x09, 0x33, //     USAGE (Rx)
	0x09, 0x34, //     USAGE (Ry)
	0x15, 0x00, //     LOGICAL_MINIMUM (0)
	0x26, 0xFF, 0x00, // LOGICAL_MAXIMUM (255)
	0x75, 0x08, //     REPORT_SIZE (8)
	0x95, 0x02, //     REPORT_COUNT (2)
	0x81, 0x02, //     INPUT (Data,Var,Abs)
	0xC0, //   END_COLLECTION

	// Triggers (Z and Rz axes)
	0x09, 0x32, //   USAGE (Z) - Left Trigger
	0x09, 0x35, //   USAGE (Rz) - Right Trigger
	0x15, 0x00, //   LOGICAL_MINIMUM (0)
	0x26, 0xFF, 0x00, // LOGICAL_MAXIMUM (255)
	0x75, 0x08, //   REPORT_SIZE (8)
	0x95, 0x02, //   REPORT_COUNT (2)
	0x81, 0x02, //   INPUT (Data,Var,Abs)

	// Buttons (16 buttons)
	0x05, 0x09, //   USAGE_PAGE (Button)
	0x19, 0x01, //   USAGE_MINIMUM (Button 1)
	0x29, 0x10, //   USAGE_MAXIMUM (Button 16)
	0x15, 0x00, //   LOGICAL_MINIMUM (0)
	0x25, 0x01, //   LOGICAL_MAXIMUM (1)
	0x75, 0x01, //   REPORT_SIZE (1)
	0x95, 0x10, //   REPORT_COUNT (16)
	0x81, 0x02, //   INPUT (Data,Var,Abs)

	0xC0, // END_COLLECTION
}

// GamepadState represents the current state of the gamepad
type GamepadState struct {
	LeftStickX   uint8  // 0-255, 128 = center
	LeftStickY   uint8  // 0-255, 128 = center
	RightStickX  uint8  // 0-255, 128 = center
	RightStickY  uint8  // 0-255, 128 = center
	LeftTrigger  uint8  // 0-255
	RightTrigger uint8  // 0-255
	Buttons      uint16 // 16 buttons as bitmask
}

// Gamepad button constants (matching standard gamepad layout)
const (
	GamepadButtonA      uint16 = 1 << 0  // Button 1
	GamepadButtonB      uint16 = 1 << 1  // Button 2
	GamepadButtonX      uint16 = 1 << 2  // Button 3
	GamepadButtonY      uint16 = 1 << 3  // Button 4
	GamepadButtonLB     uint16 = 1 << 4  // Left Bumper (Button 5)
	GamepadButtonRB     uint16 = 1 << 5  // Right Bumper (Button 6)
	GamepadButtonBack   uint16 = 1 << 6  // Back/Select (Button 7)
	GamepadButtonStart  uint16 = 1 << 7  // Start (Button 8)
	GamepadButtonL3     uint16 = 1 << 8  // Left Stick Click (Button 9)
	GamepadButtonR3     uint16 = 1 << 9  // Right Stick Click (Button 10)
	GamepadButtonGuide  uint16 = 1 << 10 // Guide/Home (Button 11)
	GamepadButtonDPadUp    uint16 = 1 << 11 // D-Pad Up (Button 12)
	GamepadButtonDPadDown  uint16 = 1 << 12 // D-Pad Down (Button 13)
	GamepadButtonDPadLeft  uint16 = 1 << 13 // D-Pad Left (Button 14)
	GamepadButtonDPadRight uint16 = 1 << 14 // D-Pad Right (Button 15)
	// Button 16 reserved
)

var gamepadWriteHidFileLock sync.Mutex

func (u *UsbGadget) gamepadWriteHidFile(data []byte) error {
	gamepadWriteHidFileLock.Lock()
	defer gamepadWriteHidFileLock.Unlock()

	if u.gamepadHidFile == nil {
		var err error
		devicePath, err := u.resolveGamepadHidPath()
		if err != nil {
			return err
		}
		u.gamepadHidFile, err = os.OpenFile(devicePath, os.O_RDWR, 0666)
		if err != nil {
			return fmt.Errorf("failed to open %s: %w", devicePath, err)
		}
	}

	_, err := u.writeWithTimeout(u.gamepadHidFile, data)
	if err != nil {
		u.logWithSuppression("gamepadWriteHidFile", 100, u.log, err, "failed to write gamepad report")
		u.gamepadHidFile.Close()
		u.gamepadHidFile = nil
		return err
	}
	u.resetLogSuppressionCounter("gamepadWriteHidFile")
	return nil
}

func (u *UsbGadget) resolveGamepadHidPath() (string, error) {
	if !u.enabledDevices.Gamepad {
		return "", fmt.Errorf("gamepad device is disabled")
	}

	functionDevPath := filepath.Join(u.kvmGadgetPath, "functions", gamepadConfig.device, "dev")
	devBytes, err := os.ReadFile(functionDevPath)
	if err != nil {
		return "", fmt.Errorf("failed to read gamepad dev: %w", err)
	}
	devNumber := strings.TrimSpace(string(devBytes))

	matches, err := filepath.Glob("/sys/class/hidg/hidg*/dev")
	if err != nil {
		return "", fmt.Errorf("failed to list hidg devices: %w", err)
	}

	for _, devPath := range matches {
		data, err := os.ReadFile(devPath)
		if err != nil {
			continue
		}
		if strings.TrimSpace(string(data)) == devNumber {
			hidgName := filepath.Base(filepath.Dir(devPath))
			return filepath.Join("/dev", hidgName), nil
		}
	}

	return "", fmt.Errorf("gamepad hid device not found")
}

// GamepadReport sends a gamepad HID report with the given state
func (u *UsbGadget) GamepadReport(state GamepadState) error {
	if !u.enabledDevices.Gamepad {
		return nil
	}

	u.gamepadLock.Lock()
	defer u.gamepadLock.Unlock()

	// Build the 8-byte HID report
	report := []byte{
		state.LeftStickX,            // Byte 0: Left stick X
		state.LeftStickY,            // Byte 1: Left stick Y
		state.RightStickX,           // Byte 2: Right stick X
		state.RightStickY,           // Byte 3: Right stick Y
		state.LeftTrigger,           // Byte 4: Left trigger
		state.RightTrigger,          // Byte 5: Right trigger
		byte(state.Buttons & 0xFF),  // Byte 6: Buttons 1-8
		byte(state.Buttons >> 8),    // Byte 7: Buttons 9-16
	}

	err := u.gamepadWriteHidFile(report)
	if err != nil {
		return err
	}

	u.resetUserInputTime()
	return nil
}

// GamepadReportRaw sends a raw 8-byte gamepad HID report
func (u *UsbGadget) GamepadReportRaw(
	leftStickX, leftStickY uint8,
	rightStickX, rightStickY uint8,
	leftTrigger, rightTrigger uint8,
	buttons uint16,
) error {
	return u.GamepadReport(GamepadState{
		LeftStickX:   leftStickX,
		LeftStickY:   leftStickY,
		RightStickX:  rightStickX,
		RightStickY:  rightStickY,
		LeftTrigger:  leftTrigger,
		RightTrigger: rightTrigger,
		Buttons:      buttons,
	})
}
