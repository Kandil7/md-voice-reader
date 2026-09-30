export interface SpeakRequest {
  id: number;
  type: "speak";
  text: string;
  length_scale: number;
}

export interface StopRequest {
  id: number;
  type: "stop";
}

export interface HealthRequest {
  id: number;
  type: "health";
}

export interface ShutdownRequest {
  id: number;
  type: "shutdown";
}

export type WorkerRequest = SpeakRequest | StopRequest | HealthRequest | ShutdownRequest;

export type ResponseType =
  | "ready"
  | "started"
  | "finished"
  | "stopped"
  | "error"
  | "health";

export interface WorkerResponse {
  id: number;
  type: ResponseType;
  message?: string;
  checks?: Record<string, string | boolean>;
}
