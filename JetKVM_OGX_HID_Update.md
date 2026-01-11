# JetKVM HID Backend Changes for OGX-Mini Compatibility

Update `hid_gamepad.go` on the JetKVM backend to advertise a TinyUSB-friendly report layout that OGX-Mini already understands.

## 1. Increase the HID report length
In the `gamepadConfig` block change `report_length` from 8 to 9:
```diff
-        "report_length":   "8",
+        "report_length":   "9",
```

## 2. Emit a proper hat switch in the descriptor
Insert this block immediately after the trigger (Rx/Ry) items:
```c
    // Hat switch (D-pad)
    0x09, 0x39,             //   USAGE (Hat switch)
    0x15, 0x00,             //   LOGICAL_MINIMUM (0)
    0x25, 0x07,             //   LOGICAL_MAXIMUM (7)
    0x35, 0x00,             //   PHYSICAL_MINIMUM (0)
    0x46, 0x3B, 0x01,       //   PHYSICAL MAXIMUM (315°)
    0x65, 0x14,             //   UNIT (English Rotation, Degree)
    0x75, 0x04, 0x95, 0x01, //   REPORT_SIZE=4, REPORT_COUNT=1
    0x81, 0x42,             //   INPUT (Data,Var,Abs,Null State)
    0x65, 0x00,             //   UNIT (None)
    0x75, 0x04, 0x95, 0x01, //   REPORT_SIZE=4, REPORT_COUNT=1 (padding)
    0x81, 0x01,             //   INPUT (Const,Array,Abs) – padding
```
Update the comment above the descriptor to match the new 9-byte report layout:
```
Byte 0: LX, 1: LY, 2: RX (Z), 3: RY (Rz), 4: LT (Rx), 5: RT (Ry),
Byte 6: Hat (values 0-8, upper nibble padding),
Byte 7: Buttons 1-8, Byte 8: Buttons 9-16.
```

## 3. Map D-pad buttons to hat values
Add these helpers below the button constants:
```go
const (
    hatUp = iota
    hatUpRight
    hatRight
    hatDownRight
    hatDown
    hatDownLeft
    hatLeft
    hatUpLeft
    hatNeutral = 8
)

const dpadMask = GamepadButtonDPadUp |
    GamepadButtonDPadDown |
    GamepadButtonDPadLeft |
    GamepadButtonDPadRight

func buttonsToHat(buttons uint16) uint8 {
    up := buttons&GamepadButtonDPadUp != 0
    down := buttons&GamepadButtonDPadDown != 0
    left := buttons&GamepadButtonDPadLeft != 0
    right := buttons&GamepadButtonDPadRight != 0

    switch {
    case up && right:
        return hatUpRight
    case up && left:
        return hatUpLeft
    case down && right:
        return hatDownRight
    case down && left:
        return hatDownLeft
    case up:
        return hatUp
    case down:
        return hatDown
    case right:
        return hatRight
    case left:
        return hatLeft
    default:
        return hatNeutral
    }
}
```

## 4. Build and send the 9-byte report
Replace the `GamepadReport` body with:
```go
hat := buttonsToHat(state.Buttons)
buttons := state.Buttons & ^dpadMask

report := []byte{
    state.LeftStickX,
    state.LeftStickY,
    state.RightStickX,
    state.RightStickY,
    state.LeftTrigger,
    state.RightTrigger,
    hat & 0x0F,      // lower nibble carries hat value
    byte(buttons),
    byte(buttons >> 8),
}
```
This strips the D-pad bits from the button mask (so OGX doesn’t see them twice) and drops the hat nibble into byte 6.

After applying these four edits restart the JetKVM gadget service. The HID interface now matches OGX-Mini’s HIDGeneric parser, so the JetKVM controller will report axes, hat, and buttons exactly the way OGX expects.
