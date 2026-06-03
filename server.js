const crypto = require("node:crypto");
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const root = __dirname;
const port = Number(process.env.PORT || 4173);
const dataDir = path.join(root, "data");
const stateFile = path.join(dataDir, "reviva-state.json");
const leadsFile = path.join(dataDir, "reviva-leads.json");

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

const sessions = new Map();

const demoUsers = [
  {
    id: "owner-lumina",
    name: "Dra. Helena Lumina",
    email: "gestora@lumina.local",
    password: "reviva123",
    role: "owner",
    tenantId: "clinic-lumina",
  },
  {
    id: "reception-lumina",
    name: "Recepção Lumina",
    email: "recepcao@lumina.local",
    password: "reviva123",
    role: "reception",
    tenantId: "clinic-lumina",
  },
];

const defaultAppState = {
  revivaV2Patients: [
    {
      id: 1,
      name: "Marina Torres",
      initials: "MT",
      type: "pos",
      tag: "Pós 48h",
      urgency: "alert",
      procedure: "Laser CO2 fracionado",
      next: "Pedir foto e checar sinais de alerta",
      status: "Janela crítica",
      automation: "D+2 laser facial",
      history: "Procedimento recente com sensibilidade relatada. Priorizar cuidado antes de oferta.",
      message: "Oi, Marina! Pode me enviar uma foto da pele em luz natural para acompanharmos sua recuperação?",
      risk: "Alto",
      value: "R$ 1.890",
      sla: "1h 20",
      score: 94,
      due: "Hoje, 14:30",
      tone: "Acolhedor",
      whatsappStage: "respondido",
      protocol: ["Pedir foto", "Checar sinais de alerta", "Transferir se houver risco"],
    },
    {
      id: 2,
      name: "Renata Alves",
      initials: "RA",
      type: "renovacao",
      tag: "Pacote vence",
      urgency: "warning",
      procedure: "Drenagem pós-operatória",
      next: "Oferecer renovação como continuidade",
      status: "Receita quente",
      automation: "Renovação com 2 sessões restantes",
      history: "Usou 8 de 10 sessões e tem alto comparecimento.",
      message: "Oi, Renata! Seu pacote está chegando ao fim. Quer ver as opções para manter a continuidade?",
      risk: "Médio",
      value: "R$ 2.400",
      sla: "3h",
      score: 86,
      due: "Hoje, 16:00",
      tone: "Comercial leve",
      whatsappStage: "entregue",
      protocol: ["Valorizar evolução", "Enviar opções", "Criar follow-up humano"],
    },
  ],
  revivaV2Flows: [
    {
      id: "laser",
      name: "Laser CO2 fracionado",
      category: "Pós-procedimento",
      status: "Ativo",
      window: "D+2",
      conversion: "31%",
      revenue: "R$ 8.900",
      health: 94,
      sla: "2h",
      owner: "Enfermagem",
      escalation: "Transferir para humano se houver dor intensa, febre ou foto fora do esperado.",
      offer: "Só sugerir retorno depois da avaliação de segurança.",
      template: "Oi, {nome}! Pode me enviar uma foto da pele em luz natural para eu conferir sua evolução?",
      variants: {
        followup: "Oi, {nome}! Passando novamente para acompanhar sua evolução.",
        human: "{nome}, vou pedir para nossa equipe assumir seu acompanhamento.",
      },
      quality: ["Janela clínica definida", "Sinais de alerta mapeados", "SLA atribuído"],
      steps: [{ time: "D+2", channel: "WhatsApp", action: "Pedir foto e classificar evolução" }],
    },
  ],
  revivaV2CrmProfiles: [
    {
      patientId: 1,
      phone: "+55 65 99821-4420",
      ltv: "R$ 12.840",
      package: "Laser premium - 3/4",
      segment: "Pós-procedimento",
      status: "Cuidado ativo",
      timeline: ["Hoje - Foto pendente"],
      conversation: ["Sistema: Bloquear oferta até avaliação."],
    },
    {
      patientId: 2,
      phone: "+55 65 99211-8801",
      ltv: "R$ 18.200",
      package: "Drenagem pós-op - 8/10",
      segment: "Renovação quente",
      status: "Pacote vence",
      timeline: ["Hoje - Renovação sugerida"],
      conversation: ["Sistema: Enviar opções de renovação."],
    },
  ],
  revivaV2AutomationRules: [
    {
      id: "renewal-hot",
      name: "Renovação com 2 sessões restantes",
      type: "Recorrência",
      status: "Ativa",
      trigger: "Pacote chega em 80% de uso",
      stop: "Renovação paga ou paciente recusou",
      owner: "Comercial",
      window: "3 dias",
      risk: "Não ofertar se houver queixa clínica aberta.",
      response: "Enviar opções e criar follow-up humano.",
      attempts: ["Valorizar evolução", "Enviar condição", "Atendente chama"],
    },
  ],
  revivaV3AgendaSlots: [
    {
      id: "laser-marina",
      patientId: 1,
      date: "Segunda, 25/05",
      time: "10:30",
      procedure: "Laser CO2 fracionado",
      window: "D+3",
      owner: "Enfermagem",
      channel: "Foto pendente",
      status: "Aguardando resposta",
      reason: "Acompanhamento pós-procedimento com sensibilidade relatada.",
    },
  ],
  revivaV3Packages: [
    {
      id: "renata-drenagem",
      patientId: 2,
      name: "Drenagem pós-operatória",
      used: 8,
      total: 10,
      value: "R$ 2.400",
      renewal: "3 dias",
      status: "Renovação quente",
      risk: "Médio",
      plan: "Valorizar evolução e oferecer continuidade semanal.",
    },
  ],
  revivaV1ClinicSettings: {
    name: "Clínica Lumina",
    whatsapp: "+55 65 99800-2020",
    hours: "Segunda a sexta, 08h às 19h",
    policy: "Retorno em até 15 dias para toxina, D+2/D+7 para procedimentos ablativos e D+30 para bioestimuladores.",
    activeRole: "owner",
  },
};

const defaultWhatsappTemplates = [
  {
    id: "pos_d1",
    name: "Pós-procedimento D+1",
    category: "Pós-procedimento",
    language: "pt_BR",
    stage: "D+1",
    body:
      "Oi, {{nome}}! Passando para acompanhar como você está nas primeiras 24h após {{procedimento}}. Me conte se teve algum desconforto fora do esperado.",
    variables: ["nome", "procedimento"],
  },
  {
    id: "pos_d2_foto",
    name: "Pós-procedimento D+2 com foto",
    category: "Pós-procedimento",
    language: "pt_BR",
    stage: "D+2",
    body:
      "Oi, {{nome}}! Pode me enviar uma foto em luz natural para acompanharmos sua evolução com cuidado? Assim validamos se está tudo dentro do esperado.",
    variables: ["nome"],
  },
  {
    id: "retorno_confirmacao",
    name: "Confirmação de retorno",
    category: "Retorno",
    language: "pt_BR",
    stage: "D+15",
    body:
      "Oi, {{nome}}! Seu retorno de {{procedimento}} já está na janela ideal. Tenho {{horario}} disponível para avaliarmos o resultado com calma. Posso reservar?",
    variables: ["nome", "procedimento", "horario"],
  },
  {
    id: "renovacao_pacote",
    name: "Renovação de pacote",
    category: "Pacotes",
    language: "pt_BR",
    stage: "Pacote vencendo",
    body:
      "Oi, {{nome}}! Seu pacote de {{procedimento}} está chegando ao fim e sua evolução está consistente. Quer que eu te envie as opções para manter a continuidade?",
    variables: ["nome", "procedimento"],
  },
  {
    id: "paciente_sumido",
    name: "Paciente sem resposta",
    category: "Recuperação",
    language: "pt_BR",
    stage: "Sem resposta",
    body:
      "Oi, {{nome}}! Notei que não conseguimos nos falar. Queria entender como você está e se posso ajudar em algo antes do próximo atendimento.",
    variables: ["nome"],
  },
  {
    id: "risco_humano",
    name: "Transferência humana",
    category: "Segurança clínica",
    language: "pt_BR",
    stage: "Risco",
    body:
      "{{nome}}, vou pedir para nossa equipe assumir seu acompanhamento agora. Queremos avaliar sua mensagem com calma antes de qualquer próxima orientação.",
    variables: ["nome"],
  },
];

function defaultWhatsappModel(clinicName = "Clínica Lumina") {
  return {
    provider: "whatsapp_cloud_api",
    mode: "sandbox",
    clinicName,
    phoneNumberId: "",
    businessAccountId: "",
    defaultTemplate: "retorno_confirmacao",
    consentRequired: true,
    webhookVerifyToken: "reviva_whatsapp_verify",
    webhookStatus: "aguardando_configuracao",
    status: "sandbox",
    lastTestAt: "",
    tokenConfigured: Boolean(process.env.WHATSAPP_TOKEN),
    templates: defaultWhatsappTemplates,
  };
}

const defaultTenant = {
  id: "clinic-lumina",
  name: "Clínica Lumina",
  plan: "Revyvas Pro",
  createdAt: new Date().toISOString(),
  integrations: {
    whatsapp: {
      mode: "sandbox",
      provider: "whatsapp_cloud_api",
      phoneNumberId: "",
      businessAccountId: "",
      status: "sandbox",
      templates: ["pos_cuidado", "retorno_confirmacao", "renovacao_pacote"],
    },
    calendar: {
      mode: "sandbox",
      provider: "Google Calendar",
      calendarId: "",
      status: "sandbox",
    },
    payments: {
      mode: "sandbox",
      provider: "Stripe/Mercado Pago",
      status: "sandbox",
    },
  },
  whatsappModel: defaultWhatsappModel("Clínica Lumina"),
  state: defaultAppState,
  auditLog: [],
};

function mergeWhatsappModel(tenant) {
  const base = defaultWhatsappModel(tenant.name || tenant.state?.revivaV1ClinicSettings?.name);
  const legacy = tenant.integrations?.whatsapp || {};
  const current = tenant.whatsappModel || {};
  const templates = Array.isArray(current.templates) && current.templates.length ? current.templates : base.templates;
  tenant.whatsappModel = {
    ...base,
    ...legacy,
    ...current,
    templates,
    tokenConfigured: Boolean(process.env.WHATSAPP_TOKEN || current.tokenConfigured),
  };
  tenant.integrations = tenant.integrations || {};
  tenant.integrations.whatsapp = {
    ...legacy,
    provider: tenant.whatsappModel.provider,
    mode: tenant.whatsappModel.mode,
    phoneNumberId: tenant.whatsappModel.phoneNumberId,
    businessAccountId: tenant.whatsappModel.businessAccountId,
    status: tenant.whatsappModel.status,
  };
  return tenant.whatsappModel;
}

async function ensureState() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    const raw = await fs.readFile(stateFile, "utf8");
    const state = JSON.parse(raw);
    Object.values(state.tenants || {}).forEach((tenant) => {
      tenant.state = { ...defaultAppState, ...(tenant.state || {}) };
      tenant.integrations = { ...defaultTenant.integrations, ...(tenant.integrations || {}) };
      tenant.whatsappModel = { ...defaultWhatsappModel(tenant.name), ...(tenant.whatsappModel || {}) };
      mergeWhatsappModel(tenant);
      tenant.auditLog = tenant.auditLog || [];
    });
    return state;
  } catch {
    const initialState = { tenants: { [defaultTenant.id]: defaultTenant } };
    await fs.writeFile(stateFile, JSON.stringify(initialState, null, 2));
    return initialState;
  }
}

async function writeState(state) {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(stateFile, JSON.stringify(state, null, 2));
}

async function appendLead(lead) {
  await fs.mkdir(dataDir, { recursive: true });
  let leads = [];
  try {
    leads = JSON.parse(await fs.readFile(leadsFile, "utf8"));
  } catch {
    leads = [];
  }
  const record = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...lead,
  };
  leads.unshift(record);
  await fs.writeFile(leadsFile, JSON.stringify(leads.slice(0, 500), null, 2));
  return record;
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function parseCookies(request) {
  return Object.fromEntries(
    String(request.headers.cookie || "")
      .split(";")
      .map((cookie) => cookie.trim())
      .filter(Boolean)
      .map((cookie) => {
        const [key, ...rest] = cookie.split("=");
        return [key, decodeURIComponent(rest.join("="))];
      }),
  );
}

function userFromRequest(request) {
  const token = parseCookies(request).reviva_session;
  return token ? sessions.get(token) : null;
}

function audit(tenant, user, event, metadata = {}) {
  tenant.auditLog.unshift({
    id: crypto.randomUUID(),
    event,
    metadata,
    userId: user?.id || "system",
    createdAt: new Date().toISOString(),
  });
  tenant.auditLog = tenant.auditLog.slice(0, 200);
}

function publicWhatsappModel(model) {
  const { webhookVerifyToken, ...publicModel } = model;
  return {
    ...publicModel,
    webhookConfigured: Boolean(webhookVerifyToken),
    tokenConfigured: Boolean(process.env.WHATSAPP_TOKEN || model.tokenConfigured),
  };
}

function publicTenant(tenant) {
  return {
    ...tenant,
    whatsappModel: publicWhatsappModel(mergeWhatsappModel(tenant)),
  };
}

function sanitizeWhatsappModel(body, previous) {
  const allowedProviders = new Set(["whatsapp_cloud_api", "zapi", "sandbox"]);
  const allowedModes = new Set(["sandbox", "live"]);
  const next = {
    ...previous,
    provider: allowedProviders.has(body.provider) ? body.provider : previous.provider,
    mode: allowedModes.has(body.mode) ? body.mode : previous.mode,
    clinicName: String(body.clinicName || previous.clinicName || "").trim(),
    phoneNumberId: String(body.phoneNumberId || "").trim(),
    businessAccountId: String(body.businessAccountId || "").trim(),
    defaultTemplate: String(body.defaultTemplate || previous.defaultTemplate || "").trim(),
    consentRequired: Boolean(body.consentRequired),
    webhookVerifyToken:
      String(body.webhookVerifyToken || "").trim() && body.webhookVerifyToken !== "configurado"
        ? String(body.webhookVerifyToken).trim()
        : previous.webhookVerifyToken,
    status: body.mode === "live" ? "pronto_para_credenciais" : "sandbox",
    tokenConfigured: Boolean(process.env.WHATSAPP_TOKEN),
  };
  if (Array.isArray(body.templates)) {
    next.templates = body.templates
      .slice(0, 30)
      .map((item) => ({
        id: String(item.id || crypto.randomUUID()).trim(),
        name: String(item.name || "Template").trim(),
        category: String(item.category || "WhatsApp").trim(),
        language: String(item.language || "pt_BR").trim(),
        stage: String(item.stage || "").trim(),
        body: String(item.body || "").trim(),
        variables: Array.isArray(item.variables) ? item.variables.map(String).slice(0, 12) : [],
      }))
      .filter((item) => item.id && item.body);
  }
  return next;
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function renderWhatsappTemplate(template, variables = {}) {
  return String(template?.body || "").replace(/\{\{\s*([\w-]+)\s*\}\}|\{([\w-]+)\}/g, (_, doubleKey, singleKey) => {
    const key = doubleKey || singleKey;
    return variables[key] || "";
  });
}

async function sendWhatsappMessage(model, payload) {
  const to = normalizePhone(payload.to);
  if (!to) throw new Error("WhatsApp da paciente não informado.");

  if (model.mode !== "live" || model.provider === "sandbox") {
    return {
      ok: true,
      mode: "sandbox",
      provider: model.provider,
      messageId: `sandbox_${Date.now()}`,
      status: "queued",
    };
  }

  if (model.provider !== "whatsapp_cloud_api") {
    return {
      ok: true,
      mode: "live",
      provider: model.provider,
      messageId: `external_${Date.now()}`,
      status: "queued",
      note: "Provedor externo preparado para adaptador dedicado.",
    };
  }

  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = model.phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    throw new Error("Configure WHATSAPP_TOKEN e Phone Number ID para envio real.");
  }

  const apiVersion = process.env.WHATSAPP_API_VERSION || "v20.0";
  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: payload.templateId || model.defaultTemplate,
        language: { code: payload.language || "pt_BR" },
      },
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error?.message || "Falha ao enviar pelo WhatsApp Cloud API.");
  return {
    ok: true,
    mode: "live",
    provider: model.provider,
    messageId: result.messages?.[0]?.id || `wa_${Date.now()}`,
    status: "sent",
    raw: result,
  };
}

async function handleApi(request, response, pathname) {
  const state = await ensureState();

  if (request.method === "POST" && pathname === "/api/auth/login") {
    const body = await readJson(request);
    const user = demoUsers.find((item) => item.email === body.email && item.password === body.password);
    if (!user) return sendJson(response, 401, { error: "Credenciais inválidas." });

    const token = crypto.randomUUID();
    sessions.set(token, {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
    });
    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": `reviva_session=${encodeURIComponent(token)}; Path=/; SameSite=Lax; HttpOnly`,
    });
    response.end(JSON.stringify({ user: sessions.get(token), tenant: publicTenant(state.tenants[user.tenantId]) }));
    return;
  }

  if (request.method === "POST" && pathname === "/api/auth/logout") {
    const token = parseCookies(request).reviva_session;
    if (token) sessions.delete(token);
    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Set-Cookie": "reviva_session=; Path=/; Max-Age=0; SameSite=Lax; HttpOnly",
    });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  if (request.method === "POST" && pathname === "/api/leads") {
    const body = await readJson(request);
    const lead = await appendLead({
      name: String(body.name || "").trim(),
      clinic: String(body.clinic || "").trim(),
      whatsapp: String(body.whatsapp || "").trim(),
      city: String(body.city || "").trim(),
      procedures: String(body.procedures || "").trim(),
      bestTime: String(body.bestTime || "").trim(),
      source: "landing-demo-form",
    });
    return sendJson(response, 201, { ok: true, leadId: lead.id });
  }

  if (request.method === "GET" && pathname === "/api/health") {
    return sendJson(response, 200, {
      ok: true,
      service: "revyvas-crm",
      timestamp: new Date().toISOString(),
    });
  }

  if (request.method === "GET" && pathname === "/api/webhooks/whatsapp") {
    const query = new URL(request.url, "http://localhost").searchParams;
    const mode = query.get("hub.mode");
    const token = query.get("hub.verify_token");
    const challenge = query.get("hub.challenge");
    const tenant = Object.values(state.tenants || {}).find((item) => mergeWhatsappModel(item).webhookVerifyToken === token);
    if (mode === "subscribe" && tenant && challenge) {
      tenant.whatsappModel.webhookStatus = "verificado";
      audit(tenant, null, "whatsapp.webhook_verified", { provider: tenant.whatsappModel.provider });
      await writeState(state);
      response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(challenge);
      return;
    }
    return sendJson(response, 403, { error: "Token de verificação inválido." });
  }

  if (request.method === "POST" && pathname === "/api/webhooks/whatsapp") {
    const body = await readJson(request);
    const phoneNumberId = body.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
    const tenant =
      Object.values(state.tenants || {}).find((item) => mergeWhatsappModel(item).phoneNumberId === phoneNumberId) ||
      Object.values(state.tenants || {})[0];
    if (tenant) {
      const value = body.entry?.[0]?.changes?.[0]?.value || {};
      const status = value.statuses?.[0]?.status;
      const message = value.messages?.[0];
      audit(tenant, null, status ? "whatsapp.webhook_status" : "whatsapp.webhook_message", {
        phoneNumberId,
        status,
        from: message?.from,
        type: message?.type,
      });
      await writeState(state);
    }
    return sendJson(response, 200, { ok: true });
  }

  const user = userFromRequest(request);
  if (!user) return sendJson(response, 401, { error: "Sessão obrigatória." });

  const tenant = state.tenants[user.tenantId] || defaultTenant;
  state.tenants[user.tenantId] = tenant;
  const whatsappModel = mergeWhatsappModel(tenant);

  if (request.method === "GET" && pathname === "/api/session") {
    return sendJson(response, 200, { user, tenant: publicTenant(tenant) });
  }

  if (request.method === "GET" && pathname === "/api/state") {
    return sendJson(response, 200, { tenantId: tenant.id, state: tenant.state || {}, auditLog: tenant.auditLog || [] });
  }

  if (request.method === "GET" && pathname === "/api/whatsapp/model") {
    return sendJson(response, 200, { tenantId: tenant.id, model: publicWhatsappModel(whatsappModel) });
  }

  if (request.method === "PUT" && pathname === "/api/whatsapp/model") {
    const body = await readJson(request);
    tenant.whatsappModel = sanitizeWhatsappModel(body.model || body, whatsappModel);
    mergeWhatsappModel(tenant);
    audit(tenant, user, "whatsapp.model_updated", {
      provider: tenant.whatsappModel.provider,
      mode: tenant.whatsappModel.mode,
      templates: tenant.whatsappModel.templates.length,
    });
    await writeState(state);
    return sendJson(response, 200, { ok: true, model: publicWhatsappModel(tenant.whatsappModel) });
  }

  if (request.method === "GET" && pathname === "/api/audit-log") {
    return sendJson(response, 200, { auditLog: tenant.auditLog || [] });
  }

  if (request.method === "GET" && pathname.startsWith("/api/privacy/export/")) {
    const patientId = Number(pathname.replace("/api/privacy/export/", ""));
    const tenantState = tenant.state || {};
    const patients = tenantState.revivaV2Patients || [];
    const profiles = tenantState.revivaV2CrmProfiles || [];
    const packages = tenantState.revivaV3Packages || [];
    const appointments = tenantState.revivaV3AgendaSlots || [];
    const patient = patients.find((item) => item.id === patientId);
    if (!patient) return sendJson(response, 404, { error: "Paciente não encontrada." });
    audit(tenant, user, "privacy.export", { patientId });
    await writeState(state);
    return sendJson(response, 200, {
      patient,
      profile: profiles.find((item) => item.patientId === patientId) || null,
      packages: packages.filter((item) => item.patientId === patientId),
      appointments: appointments.filter((item) => item.patientId === patientId),
    });
  }

  if (request.method === "DELETE" && pathname.startsWith("/api/privacy/patient/")) {
    const patientId = Number(pathname.replace("/api/privacy/patient/", ""));
    tenant.state = tenant.state || {};
    tenant.state.revivaV2Patients = (tenant.state.revivaV2Patients || []).filter((item) => item.id !== patientId);
    tenant.state.revivaV2CrmProfiles = (tenant.state.revivaV2CrmProfiles || []).filter((item) => item.patientId !== patientId);
    tenant.state.revivaV3Packages = (tenant.state.revivaV3Packages || []).filter((item) => item.patientId !== patientId);
    tenant.state.revivaV3AgendaSlots = (tenant.state.revivaV3AgendaSlots || []).filter((item) => item.patientId !== patientId);
    audit(tenant, user, "privacy.delete_patient", { patientId });
    await writeState(state);
    return sendJson(response, 200, { ok: true, patientId });
  }

  if (request.method === "PUT" && pathname.startsWith("/api/state/")) {
    const key = decodeURIComponent(pathname.replace("/api/state/", ""));
    const body = await readJson(request);
    tenant.state = tenant.state || {};
    tenant.state[key] = body.value;
    audit(tenant, user, "state.updated", { key });
    await writeState(state);
    return sendJson(response, 200, { ok: true, key });
  }

  if (request.method === "PUT" && pathname === "/api/integrations") {
    const body = await readJson(request);
    tenant.integrations = { ...tenant.integrations, ...body.integrations };
    audit(tenant, user, "integrations.updated", { providers: Object.keys(body.integrations || {}) });
    await writeState(state);
    return sendJson(response, 200, { ok: true, integrations: tenant.integrations });
  }

  if (request.method === "POST" && pathname === "/api/integrations/whatsapp/test") {
    const body = await readJson(request);
    const template = whatsappModel.templates.find((item) => item.id === (body.templateId || whatsappModel.defaultTemplate)) || whatsappModel.templates[0];
    const result = await sendWhatsappMessage(whatsappModel, {
      to: body.to || tenant.state?.revivaV1ClinicSettings?.whatsapp,
      templateId: template.id,
      language: template.language,
    });
    tenant.whatsappModel.lastTestAt = new Date().toISOString();
    tenant.whatsappModel.status = result.status === "sent" ? "ativo" : "teste_ok";
    audit(tenant, user, "whatsapp.test", { to: body.to || "clinica", template: template.id, status: result.status });
    await writeState(state);
    return sendJson(response, 200, result);
  }

  if (request.method === "POST" && (pathname === "/api/integrations/whatsapp/send" || pathname === "/api/whatsapp/send-template")) {
    const body = await readJson(request);
    const patientId = Number(body.patientId);
    const patient = (tenant.state?.revivaV2Patients || []).find((item) => item.id === patientId);
    const profile = (tenant.state?.revivaV2CrmProfiles || []).find((item) => item.patientId === patientId);
    const template = whatsappModel.templates.find((item) => item.id === (body.templateId || body.template || whatsappModel.defaultTemplate)) || whatsappModel.templates[0];
    if (whatsappModel.consentRequired && body.consent === false) {
      return sendJson(response, 422, { error: "Consentimento de WhatsApp obrigatório para este modelo." });
    }
    const variables = {
      nome: patient?.name?.split(" ")[0] || body.name || "Paciente",
      procedimento: patient?.procedure || body.procedure || "seu procedimento",
      horario: body.horario || "um horário nesta semana",
      ...(body.variables || {}),
    };
    const renderedText = renderWhatsappTemplate(template, variables);
    const result = await sendWhatsappMessage(whatsappModel, {
      to: body.to || profile?.phone,
      templateId: template.id,
      language: template.language,
    });
    audit(tenant, user, "whatsapp.template_send", {
      patientId,
      to: body.to || profile?.phone,
      template: template.id,
      status: result.status,
    });
    await writeState(state);
    return sendJson(response, 200, { ...result, preview: renderedText, template: template.id });
  }

  if (request.method === "POST" && pathname === "/api/integrations/calendar/book") {
    const body = await readJson(request);
    audit(tenant, user, "calendar.sandbox_book", { patientId: body.patientId, startsAt: body.startsAt });
    await writeState(state);
    return sendJson(response, 200, {
      ok: true,
      mode: tenant.integrations.calendar.mode,
      eventId: `calendar_${Date.now()}`,
      status: "confirmed",
    });
  }

  if (request.method === "POST" && pathname === "/api/integrations/payments/link") {
    const body = await readJson(request);
    audit(tenant, user, "payment.sandbox_link", { packageId: body.packageId, amount: body.amount });
    await writeState(state);
    return sendJson(response, 200, {
      ok: true,
      paymentUrl: `https://pay.revyvas.local/sandbox/${crypto.randomUUID()}`,
      status: "created",
    });
  }

  return sendJson(response, 404, { error: "Rota não encontrada." });
}

async function serveStatic(request, response, pathname) {
  const requestedPath = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const relativePath = requestedPath.endsWith("/") ? `${requestedPath}index.html` : requestedPath;
  const filePath = path.resolve(root, relativePath);

  if (!filePath.toLowerCase().startsWith(root.toLowerCase())) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  const content = await fs.readFile(filePath);
  response.writeHead(200, {
    "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream",
  });
  response.end(content);
}

const server = http.createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, "http://localhost").pathname;
    if (pathname.startsWith("/api/")) {
      await handleApi(request, response, pathname);
      return;
    }
    await serveStatic(request, response, pathname);
  } catch (error) {
    const isApi = request.url.startsWith("/api/");
    if (isApi) return sendJson(response, 500, { error: error.message });
    response.writeHead(404);
    response.end("Not found");
  }
});

const host = process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1";

server.listen(port, host, () => {
  console.log(`Revyvas running at http://${host}:${port}`);
  console.log("Demo login: gestora@lumina.local / reviva123");
});
