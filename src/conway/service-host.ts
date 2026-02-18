/**
 * x402 Service Host
 *
 * Enables the automaton to host and sell services to other agents.
 * Instead of only buying services, the automaton can now earn revenue
 * by exposing endpoints that accept x402 payments.
 */

import { ulid } from "ulid";
import type {
  AutomatonDatabase,
  ConwayClient,
  HostedService,
} from "../types.js";

export async function createHostedService(
  db: AutomatonDatabase,
  conway: ConwayClient,
  params: {
    name: string;
    description: string;
    priceCents: number;
    handlerCode: string;
  },
): Promise<HostedService> {
  const id = ulid();

  const activeServices = db.getHostedServices(true);
  const serviceCount = activeServices.length;
  const port = 8000 + serviceCount;

  const handlerScript = `const http = require('http');
const handler = ${params.handlerCode};
const server = http.createServer(async (req, res) => {
  try {
    const body = await new Promise(r => { let d=''; req.on('data',c=>d+=c); req.on('end',()=>r(d)); });
    const result = await handler(JSON.parse(body || '{}'));
    res.writeHead(200, {'Content-Type':'application/json'});
    res.end(JSON.stringify(result));
  } catch(e) {
    res.writeHead(500); res.end(JSON.stringify({error: e.message}));
  }
});
server.listen(${port});`;

  await conway.exec(`mkdir -p /root/services/${id}`);
  await conway.writeFile(`/root/services/${id}/handler.js`, handlerScript);
  const portInfo = await conway.exposePort(port);
  await conway.exec(`PORT=${port} node /root/services/${id}/handler.js &`);

  const service: HostedService = {
    id,
    name: params.name,
    description: params.description,
    endpoint: portInfo.publicUrl,
    priceCents: params.priceCents,
    handlerCode: params.handlerCode,
    active: true,
    totalRequests: 0,
    totalEarnedCents: 0,
    createdAt: new Date().toISOString(),
  };

  db.upsertHostedService(service);

  return service;
}

export async function stopService(
  db: AutomatonDatabase,
  conway: ConwayClient,
  serviceId: string,
): Promise<void> {
  const service = db.getHostedServiceById(serviceId);
  if (!service) {
    throw new Error(`Service ${serviceId} not found`);
  }

  await conway.exec(`pkill -f "services/${serviceId}"`);

  service.active = false;
  db.upsertHostedService(service);
}

export function listActiveServices(
  db: AutomatonDatabase,
): HostedService[] {
  return db.getHostedServices(true);
}

export function getServiceRevenue(db: AutomatonDatabase): {
  totalEarnedCents: number;
  serviceBreakdown: { name: string; earned: number; requests: number }[];
} {
  const services = db.getHostedServices();

  const totalEarnedCents = services.reduce(
    (sum, s) => sum + s.totalEarnedCents,
    0,
  );

  const serviceBreakdown = services.map((s) => ({
    name: s.name,
    earned: s.totalEarnedCents,
    requests: s.totalRequests,
  }));

  return { totalEarnedCents, serviceBreakdown };
}

export function recordServiceRequest(
  db: AutomatonDatabase,
  serviceId: string,
  earnedCents: number,
): void {
  db.incrementServiceStats(serviceId, earnedCents);
}

export function formatServiceReport(db: AutomatonDatabase): string {
  const services = db.getHostedServices();

  if (services.length === 0) {
    return "No hosted services.";
  }

  const lines = ["Hosted Services:", ""];

  for (const service of services) {
    const status = service.active ? "ACTIVE" : "INACTIVE";
    lines.push(`[${status}] ${service.name}`);
    lines.push(`  Endpoint: ${service.endpoint}`);
    lines.push(`  Price: $${(service.priceCents / 100).toFixed(2)}`);
    lines.push(`  Requests: ${service.totalRequests}`);
    lines.push(
      `  Total Earned: $${(service.totalEarnedCents / 100).toFixed(2)}`,
    );
    lines.push("");
  }

  const revenue = getServiceRevenue(db);
  lines.push(
    `Total Revenue: $${(revenue.totalEarnedCents / 100).toFixed(2)}`,
  );

  return lines.join("\n");
}
