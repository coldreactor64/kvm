import { useEffect, useState } from "react";
import { LuGamepad2 } from "react-icons/lu";

import Card from "@components/Card";
import { useSettingsStore } from "@hooks/stores";
import useGamepad from "@hooks/useGamepad";
import { GAMEPAD_BUTTONS } from "@hooks/hidRpc";

function GamepadButtonIndicator({ active, label }: { active: boolean; label: string }) {
  return (
    <div
      className={`flex h-6 w-6 items-center justify-center rounded text-xs font-medium ${
        active
          ? "bg-blue-500 text-white"
          : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400"
      }`}
    >
      {label}
    </div>
  );
}

function StickIndicator({ x, y, label }: { x: number; y: number; label: string }) {
  // Convert 0-255 to -1 to 1 range
  const normalizedX = (x - 128) / 128;
  const normalizedY = (y - 128) / 128;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative h-12 w-12 rounded-full border-2 border-slate-300 bg-slate-100 dark:border-slate-600 dark:bg-slate-800">
        <div
          className="absolute h-3 w-3 rounded-full bg-blue-500"
          style={{
            left: `${50 + normalizedX * 40}%`,
            top: `${50 + normalizedY * 40}%`,
            transform: "translate(-50%, -50%)",
          }}
        />
      </div>
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
    </div>
  );
}

function TriggerIndicator({ value, label }: { value: number; label: string }) {
  const percentage = (value / 255) * 100;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative h-16 w-4 overflow-hidden rounded border border-slate-300 bg-slate-100 dark:border-slate-600 dark:bg-slate-800">
        <div
          className="absolute bottom-0 left-0 w-full bg-blue-500 transition-[height] duration-100"
          style={{ height: `${percentage}%` }}
        />
      </div>
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
    </div>
  );
}

export default function GamepadPopover() {
  const { gamepadEnabled, setGamepadEnabled } = useSettingsStore();
  const {
    isConnected,
    gamepadName,
    currentState,
    connectedGamepads,
    startPolling,
    stopPolling,
    isPolling,
    isSupported,
  } = useGamepad({ enabled: gamepadEnabled });
  const [hasFocus, setHasFocus] = useState(
    typeof document !== "undefined" ? document.hasFocus() : true,
  );

  // Start/stop polling based on gamepadEnabled setting
  useEffect(() => {
    if (gamepadEnabled && !isPolling) {
      startPolling();
    } else if (!gamepadEnabled && isPolling) {
      stopPolling();
    }
  }, [gamepadEnabled, isPolling, startPolling, stopPolling]);

  useEffect(() => {
    const handleFocus = () => setHasFocus(true);
    const handleBlur = () => setHasFocus(false);

    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  const buttons = currentState?.buttons ?? 0;

  return (
    <div className="w-full p-4 pt-6">
      <Card className="p-4">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <LuGamepad2 className="h-5 w-5 text-slate-600 dark:text-slate-400" />
              <h3 className="text-sm font-medium text-slate-900 dark:text-slate-100">
                Gamepad Input
              </h3>
            </div>
            <label className="flex cursor-pointer items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {gamepadEnabled ? "Enabled" : "Disabled"}
              </span>
              <input
                type="checkbox"
                checked={gamepadEnabled}
                onChange={e => setGamepadEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
            </label>
          </div>

          {!isSupported && (
            <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
              Gamepad API is not supported in this browser.
            </div>
          )}

          <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              Diagnostics
            </div>
            <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
              <span className="text-slate-500 dark:text-slate-400">API</span>
              <span className="font-medium">{isSupported ? "Supported" : "Unsupported"}</span>
              <span className="text-slate-500 dark:text-slate-400">Focused</span>
              <span className="font-medium">{hasFocus ? "Yes" : "No"}</span>
              <span className="text-slate-500 dark:text-slate-400">Polling</span>
              <span className="font-medium">{isPolling ? "On" : "Off"}</span>
              <span className="text-slate-500 dark:text-slate-400">Connected</span>
              <span className="font-medium">{isConnected ? "Yes" : "No"}</span>
              <span className="text-slate-500 dark:text-slate-400">Detected</span>
              <span className="font-medium">{connectedGamepads.length}</span>
              <span className="text-slate-500 dark:text-slate-400">Active</span>
              <span className="font-medium break-all">{gamepadName ?? "None"}</span>
            </div>
            {connectedGamepads.length > 0 && (
              <div className="mt-1 text-slate-500 dark:text-slate-400">
                Devices: <span className="break-all">{connectedGamepads.join(", ")}</span>
              </div>
            )}
          </div>

          {gamepadEnabled && (
            <>
              <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
                <div className="flex items-center gap-2">
                  <div
                    className={`h-2 w-2 rounded-full ${
                      isConnected ? "bg-green-500" : "bg-slate-400"
                    }`}
                  />
                  <span className="text-xs text-slate-600 dark:text-slate-400">
                    {isConnected
                      ? `Connected: ${gamepadName}`
                      : connectedGamepads.length > 0
                        ? "Gamepad detected - press any button to activate"
                        : "No gamepad detected"}
                  </span>
                </div>
              </div>

              {isConnected && currentState && (
                <div className="flex flex-col gap-4 border-t border-slate-200 pt-3 dark:border-slate-700">
                  <div className="relative rounded-[28px] border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-4 pb-6 shadow-sm dark:border-slate-700 dark:from-slate-900/70 dark:to-slate-900/40">
                    <div className="absolute bottom-0 left-6 h-5 w-14 rounded-b-[24px] border border-slate-200 bg-white/80 opacity-80 dark:border-slate-700 dark:bg-slate-900/70" />
                    <div className="absolute bottom-0 right-6 h-5 w-14 rounded-b-[24px] border border-slate-200 bg-white/80 opacity-80 dark:border-slate-700 dark:bg-slate-900/70" />

                    <div className="relative z-10 flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <GamepadButtonIndicator
                          active={(buttons & GAMEPAD_BUTTONS.LB) !== 0}
                          label="LB"
                        />
                        <TriggerIndicator value={currentState.leftTrigger} label="LT" />
                      </div>
                      <div className="flex items-center gap-2">
                        <TriggerIndicator value={currentState.rightTrigger} label="RT" />
                        <GamepadButtonIndicator
                          active={(buttons & GAMEPAD_BUTTONS.RB) !== 0}
                          label="RB"
                        />
                      </div>
                    </div>

                    <div className="relative z-10 mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-6">
                      <div className="flex flex-col items-center gap-3">
                        <div className="grid grid-cols-3 gap-1">
                          <div />
                          <GamepadButtonIndicator
                            active={(buttons & GAMEPAD_BUTTONS.DPadUp) !== 0}
                            label="U"
                          />
                          <div />
                          <GamepadButtonIndicator
                            active={(buttons & GAMEPAD_BUTTONS.DPadLeft) !== 0}
                            label="L"
                          />
                          <div className="h-6 w-6" />
                          <GamepadButtonIndicator
                            active={(buttons & GAMEPAD_BUTTONS.DPadRight) !== 0}
                            label="R"
                          />
                          <div />
                          <GamepadButtonIndicator
                            active={(buttons & GAMEPAD_BUTTONS.DPadDown) !== 0}
                            label="D"
                          />
                          <div />
                        </div>
                        <StickIndicator
                          x={currentState.leftStickX}
                          y={currentState.leftStickY}
                          label="L"
                        />
                        <GamepadButtonIndicator
                          active={(buttons & GAMEPAD_BUTTONS.L3) !== 0}
                          label="L3"
                        />
                      </div>

                      <div className="flex flex-col items-center gap-2">
                        <div className="flex items-center gap-2">
                          <GamepadButtonIndicator
                            active={(buttons & GAMEPAD_BUTTONS.Back) !== 0}
                            label="Bk"
                          />
                          <GamepadButtonIndicator
                            active={(buttons & GAMEPAD_BUTTONS.Start) !== 0}
                            label="St"
                          />
                          <GamepadButtonIndicator
                            active={(buttons & GAMEPAD_BUTTONS.Guide) !== 0}
                            label="Gd"
                          />
                        </div>
                        <span className="text-[10px] uppercase tracking-wide text-slate-400">
                          Center
                        </span>
                      </div>

                      <div className="flex flex-col items-center gap-3">
                        <div className="grid grid-cols-3 gap-1">
                          <div />
                          <GamepadButtonIndicator
                            active={(buttons & GAMEPAD_BUTTONS.Y) !== 0}
                            label="Y"
                          />
                          <div />
                          <GamepadButtonIndicator
                            active={(buttons & GAMEPAD_BUTTONS.X) !== 0}
                            label="X"
                          />
                          <div className="h-6 w-6" />
                          <GamepadButtonIndicator
                            active={(buttons & GAMEPAD_BUTTONS.B) !== 0}
                            label="B"
                          />
                          <div />
                          <GamepadButtonIndicator
                            active={(buttons & GAMEPAD_BUTTONS.A) !== 0}
                            label="A"
                          />
                          <div />
                        </div>
                        <StickIndicator
                          x={currentState.rightStickX}
                          y={currentState.rightStickY}
                          label="R"
                        />
                        <GamepadButtonIndicator
                          active={(buttons & GAMEPAD_BUTTONS.R3) !== 0}
                          label="R3"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Connect a gamepad to your computer and enable passthrough to control the remote system.
          </p>
        </div>
      </Card>
    </div>
  );
}
