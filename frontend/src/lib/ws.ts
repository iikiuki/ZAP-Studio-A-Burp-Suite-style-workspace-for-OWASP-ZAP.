import { useEffect, useRef } from "react";

export interface ServerEvent {
  channel: "hello" | "history" | "alerts" | "scan" | "intercept";
  data: Record<string, unknown>;
}

type Handler = (event: ServerEvent) => void;

export function useEventStream(onEvent: Handler): void {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      socket = new WebSocket(`${proto}://${window.location.host}/ws`);
      socket.onmessage = (event) => {
        try {
          handlerRef.current(JSON.parse(event.data) as ServerEvent);
        } catch {
          /* ignore malformed frames */
        }
      };
      socket.onclose = () => {
        if (!closed) retry = setTimeout(connect, 2000);
      };
      socket.onerror = () => socket?.close();
    };

    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      socket?.close();
    };
  }, []);
}
