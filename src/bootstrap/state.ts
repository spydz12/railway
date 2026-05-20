export interface RuntimeServiceHealth {
  scanner: boolean;
  tracking: boolean;
  workers: boolean;
  cron: boolean;
  telegram: boolean;
  database: boolean;
  heartbeat: string;
}

const runtimeHealth: RuntimeServiceHealth = {
  scanner: false,
  tracking: false,
  workers: false,
  cron: false,
  telegram: false,
  database: false,
  heartbeat: new Date().toISOString(),
};

export function setRuntimeService<K extends keyof RuntimeServiceHealth>(key: K, value: RuntimeServiceHealth[K]): void {
  runtimeHealth[key] = value;
}

export function touchHeartbeat(): void {
  runtimeHealth.heartbeat = new Date().toISOString();
}

export function getRuntimeHealth(): RuntimeServiceHealth {
  return { ...runtimeHealth };
}
