import { useCallback, useEffect, useRef, useState } from "react";

import { GamepadState, GAMEPAD_BUTTONS } from "./hidRpc";
import { useHidRpc } from "./useHidRpc";

const STICK_DEADZONE = 0.15;
const POLL_INTERVAL = 16;

type GamepadGetter = () => (Gamepad | null)[];

function isGamepadApiSupported(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }

  const hasStandard = typeof navigator.getGamepads === "function";
  const hasWebkit =
    typeof (
      navigator as Navigator & {
        webkitGetGamepads?: () => Gamepad[];
      }
    ).webkitGetGamepads === "function";

  return hasStandard || hasWebkit;
}

function readGamepads(): (Gamepad | null)[] {
  if (typeof navigator === "undefined") {
    return [];
  }

  const standardGetter = navigator.getGamepads?.bind(navigator);
  const webkitGetter = (
    navigator as Navigator & {
      webkitGetGamepads?: () => Gamepad[];
    }
  ).webkitGetGamepads?.bind(navigator);
  const getter: GamepadGetter | undefined = standardGetter ?? webkitGetter;

  return getter ? Array.from(getter()) : [];
}

function processStickAxis(value: number, deadzone: number = STICK_DEADZONE): number {
  if (Math.abs(value) < deadzone) {
    return 128;
  }

  const sign = Math.sign(value);
  const magnitude = (Math.abs(value) - deadzone) / (1 - deadzone);
  const scaled = sign * magnitude;

  return Math.round((scaled + 1) * 127.5);
}

function processTrigger(value: number): number {
  return Math.round(value * 255);
}

function mapButtons(gamepad: Gamepad): number {
  let buttons = 0;

  if (gamepad.buttons[0]?.pressed) buttons |= GAMEPAD_BUTTONS.A;
  if (gamepad.buttons[1]?.pressed) buttons |= GAMEPAD_BUTTONS.B;
  if (gamepad.buttons[2]?.pressed) buttons |= GAMEPAD_BUTTONS.X;
  if (gamepad.buttons[3]?.pressed) buttons |= GAMEPAD_BUTTONS.Y;
  if (gamepad.buttons[4]?.pressed) buttons |= GAMEPAD_BUTTONS.LB;
  if (gamepad.buttons[5]?.pressed) buttons |= GAMEPAD_BUTTONS.RB;
  if (gamepad.buttons[8]?.pressed) buttons |= GAMEPAD_BUTTONS.Back;
  if (gamepad.buttons[9]?.pressed) buttons |= GAMEPAD_BUTTONS.Start;
  if (gamepad.buttons[10]?.pressed) buttons |= GAMEPAD_BUTTONS.L3;
  if (gamepad.buttons[11]?.pressed) buttons |= GAMEPAD_BUTTONS.R3;
  if (gamepad.buttons[12]?.pressed) buttons |= GAMEPAD_BUTTONS.DPadUp;
  if (gamepad.buttons[13]?.pressed) buttons |= GAMEPAD_BUTTONS.DPadDown;
  if (gamepad.buttons[14]?.pressed) buttons |= GAMEPAD_BUTTONS.DPadLeft;
  if (gamepad.buttons[15]?.pressed) buttons |= GAMEPAD_BUTTONS.DPadRight;
  if (gamepad.buttons[16]?.pressed) buttons |= GAMEPAD_BUTTONS.Guide;

  return buttons;
}

function getTriggers(gamepad: Gamepad): { left: number; right: number } {
  const leftTrigger = gamepad.buttons[6]?.value ?? (gamepad.buttons[6]?.pressed ? 1 : 0);
  const rightTrigger = gamepad.buttons[7]?.value ?? (gamepad.buttons[7]?.pressed ? 1 : 0);

  return {
    left: processTrigger(leftTrigger),
    right: processTrigger(rightTrigger),
  };
}

function gamepadToState(gamepad: Gamepad): GamepadState {
  const triggers = getTriggers(gamepad);

  return {
    leftStickX: processStickAxis(gamepad.axes[0] ?? 0),
    leftStickY: processStickAxis(gamepad.axes[1] ?? 0),
    rightStickX: processStickAxis(gamepad.axes[2] ?? 0),
    rightStickY: processStickAxis(gamepad.axes[3] ?? 0),
    leftTrigger: triggers.left,
    rightTrigger: triggers.right,
    buttons: mapButtons(gamepad),
  };
}

function statesAreDifferent(a: GamepadState | null, b: GamepadState): boolean {
  if (a === null) return true;

  return (
    a.leftStickX !== b.leftStickX ||
    a.leftStickY !== b.leftStickY ||
    a.rightStickX !== b.rightStickX ||
    a.rightStickY !== b.rightStickY ||
    a.leftTrigger !== b.leftTrigger ||
    a.rightTrigger !== b.rightTrigger ||
    a.buttons !== b.buttons
  );
}

function createNeutralState(): GamepadState {
  return {
    leftStickX: 128,
    leftStickY: 128,
    rightStickX: 128,
    rightStickY: 128,
    leftTrigger: 0,
    rightTrigger: 0,
    buttons: 0,
  };
}

export interface UseGamepadOptions {
  enabled?: boolean;
  gamepadIndex?: number;
}

export interface UseGamepadReturn {
  isConnected: boolean;
  gamepadName: string | null;
  currentState: GamepadState | null;
  connectedGamepads: string[];
  startPolling: () => void;
  stopPolling: () => void;
  isPolling: boolean;
  isSupported: boolean;
}

export default function useGamepad(options: UseGamepadOptions = {}): UseGamepadReturn {
  const { enabled = true, gamepadIndex } = options;

  const isSupported = isGamepadApiSupported();
  const [isConnected, setIsConnected] = useState(false);
  const [gamepadName, setGamepadName] = useState<string | null>(null);
  const [currentState, setCurrentState] = useState<GamepadState | null>(null);
  const [connectedGamepads, setConnectedGamepads] = useState<string[]>([]);
  const [isPolling, setIsPolling] = useState(false);

  const lastStateRef = useRef<GamepadState | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeGamepadIndexRef = useRef<number | null>(null);
  const connectedGamepadsRef = useRef<string[]>([]);
  const activeGamepadIdRef = useRef<string | null>(null);
  const loggedHidNotReadyRef = useRef(false);

  const { reportGamepadEvent, rpcHidReady } = useHidRpc();

  useEffect(() => {
    if (!isSupported) {
      console.warn("[gamepad] Gamepad API not supported in this browser.");
      return;
    }
    console.info("[gamepad] Gamepad API supported.");
  }, [isSupported]);

  const updateConnectedGamepads = useCallback((gamepads?: (Gamepad | null)[]) => {
    const knownGamepads = gamepads ?? readGamepads();
    const names: string[] = [];
    for (let i = 0; i < knownGamepads.length; i++) {
      const gp = knownGamepads[i];
      if (gp) {
        names.push(gp.id);
      }
    }
    const nextNames = names.filter(Boolean);
    const previousNames = connectedGamepadsRef.current;
    if (
      previousNames.length !== nextNames.length ||
      previousNames.some((name, index) => name !== nextNames[index])
    ) {
      connectedGamepadsRef.current = nextNames;
      setConnectedGamepads(nextNames);
      console.info("[gamepad] connected gamepads:", nextNames);
    }
  }, []);

  const findGamepad = useCallback(
    (gamepads?: (Gamepad | null)[]): Gamepad | null => {
      const knownGamepads = gamepads ?? readGamepads();

      if (gamepadIndex !== undefined) {
        return knownGamepads[gamepadIndex] ?? null;
      }

      if (activeGamepadIndexRef.current !== null) {
        const gp = knownGamepads[activeGamepadIndexRef.current];
        if (gp && gp.connected) {
          return gp;
        }
      }

      for (let i = 0; i < knownGamepads.length; i++) {
        const gp = knownGamepads[i];
        if (gp && gp.connected) {
          activeGamepadIndexRef.current = i;
          return gp;
        }
      }

      activeGamepadIndexRef.current = null;
      return null;
    },
    [gamepadIndex],
  );

  const pollGamepad = useCallback(() => {
    if (!enabled) return;

    const gamepads = readGamepads();
    updateConnectedGamepads(gamepads);
    const gamepad = findGamepad(gamepads);

    if (!gamepad) {
      if (isConnected) {
        setIsConnected(false);
        setGamepadName(null);
        const neutralState = createNeutralState();
        if (rpcHidReady) {
          reportGamepadEvent(neutralState);
        }
        lastStateRef.current = neutralState;
        setCurrentState(neutralState);
      }
      if (activeGamepadIdRef.current !== null) {
        activeGamepadIdRef.current = null;
        console.info("[gamepad] no active gamepad detected.");
      }
      return;
    }

    if (!isConnected || gamepadName !== gamepad.id) {
      setIsConnected(true);
      setGamepadName(gamepad.id);
    }
    if (activeGamepadIdRef.current !== gamepad.id) {
      activeGamepadIdRef.current = gamepad.id;
      console.info("[gamepad] active gamepad:", {
        id: gamepad.id,
        index: gamepad.index,
        mapping: gamepad.mapping,
        axes: gamepad.axes.length,
        buttons: gamepad.buttons.length,
      });
    }

    const state = gamepadToState(gamepad);

    if (statesAreDifferent(lastStateRef.current, state)) {
      if (rpcHidReady) {
        reportGamepadEvent(state);
      } else if (!loggedHidNotReadyRef.current) {
        loggedHidNotReadyRef.current = true;
        console.info("[gamepad] HID RPC not ready; skipping report send.");
      }
      lastStateRef.current = state;
      setCurrentState(state);
    }
  }, [
    enabled,
    rpcHidReady,
    findGamepad,
    updateConnectedGamepads,
    isConnected,
    gamepadName,
    reportGamepadEvent,
  ]);

  const startPolling = useCallback(() => {
    if (pollIntervalRef.current) return;

    setIsPolling(true);
    pollIntervalRef.current = setInterval(pollGamepad, POLL_INTERVAL);
    console.info("[gamepad] polling started.");
  }, [pollGamepad]);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setIsPolling(false);

    if (rpcHidReady) {
      const neutralState = createNeutralState();
      reportGamepadEvent(neutralState);
      lastStateRef.current = neutralState;
      setCurrentState(neutralState);
    }
    console.info("[gamepad] polling stopped.");
  }, [rpcHidReady, reportGamepadEvent]);

  useEffect(() => {
    const handleConnect = (e: GamepadEvent) => {
      console.log("Gamepad connected:", e.gamepad.id);
      updateConnectedGamepads();
    };

    const handleDisconnect = (e: GamepadEvent) => {
      console.log("Gamepad disconnected:", e.gamepad.id);
      updateConnectedGamepads();

      if (activeGamepadIndexRef.current === e.gamepad.index) {
        activeGamepadIndexRef.current = null;
      }
    };

    window.addEventListener("gamepadconnected", handleConnect);
    window.addEventListener("gamepaddisconnected", handleDisconnect);

    updateConnectedGamepads();

    return () => {
      window.removeEventListener("gamepadconnected", handleConnect);
      window.removeEventListener("gamepaddisconnected", handleDisconnect);
    };
  }, [updateConnectedGamepads]);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (rpcHidReady) {
      lastStateRef.current = null;
      loggedHidNotReadyRef.current = false;
    }
  }, [rpcHidReady]);

  useEffect(() => {
    if (isPolling && pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = setInterval(pollGamepad, POLL_INTERVAL);
    }
  }, [pollGamepad, isPolling]);

  return {
    isConnected,
    gamepadName,
    currentState,
    connectedGamepads,
    startPolling,
    stopPolling,
    isPolling,
    isSupported,
  };
}
