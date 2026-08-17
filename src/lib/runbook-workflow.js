const statusLabels = {
  pending: "moved to pending",
  in_progress: "started",
  blocked: "blocked",
  done: "completed",
};

export function createTimelineEvent({ id, type, message, actorId, createdAt }) {
  return {
    id: id ?? makeId("evt"),
    type,
    message,
    actorId,
    createdAt: createdAt ?? new Date().toISOString(),
  };
}

export function createIncidentFromRunbook({
  id,
  title,
  severity,
  serviceId,
  runbook,
  commanderId,
  createdAt,
}) {
  const startedAt = createdAt ?? new Date().toISOString();
  const incidentId = id ?? makeId("inc");

  return {
    id: incidentId,
    title: title || runbook.title,
    serviceId: serviceId || runbook.serviceId,
    runbookId: runbook.id,
    severity: severity || runbook.defaultSeverity,
    status: "active",
    commanderId,
    startedAt,
    resolvedAt: null,
    summary: "",
    steps: runbook.steps.map((step) => ({
      id: `${incidentId}-${step.id}`,
      sourceStepId: step.id,
      title: step.title,
      detail: step.detail,
      role: step.role,
      required: step.required,
      status: "pending",
      assigneeId: null,
      completedAt: null,
    })),
    timeline: [
      createTimelineEvent({
        id: `${incidentId}-opened`,
        type: "opened",
        message: `Incident opened from ${runbook.title}.`,
        actorId: commanderId,
        createdAt: startedAt,
      }),
    ],
    notes: [],
  };
}

export function setStepStatus(incident, stepId, nextStatus, actorId, createdAt) {
  const eventTime = createdAt ?? new Date().toISOString();
  let changedStep = null;
  const steps = incident.steps.map((step) => {
    if (step.id !== stepId) {
      return step;
    }

    changedStep = {
      ...step,
      status: nextStatus,
      completedAt: nextStatus === "done" ? eventTime : null,
    };

    return changedStep;
  });

  if (!changedStep) {
    return incident;
  }

  return {
    ...incident,
    steps,
    timeline: [
      createTimelineEvent({
        type: stepEventType(nextStatus),
        message: `${changedStep.title} ${statusLabels[nextStatus] ?? "updated"}.`,
        actorId,
        createdAt: eventTime,
      }),
      ...incident.timeline,
    ],
  };
}

export function assignStep(incident, stepId, assigneeId, actorId, createdAt) {
  let changedStep = null;
  const steps = incident.steps.map((step) => {
    if (step.id !== stepId) {
      return step;
    }

    changedStep = { ...step, assigneeId };
    return changedStep;
  });

  if (!changedStep) {
    return incident;
  }

  return {
    ...incident,
    steps,
    timeline: [
      createTimelineEvent({
        type: "assignment",
        message: `${changedStep.title} assignment updated.`,
        actorId,
        createdAt,
      }),
      ...incident.timeline,
    ],
  };
}

export function addIncidentNote(incident, body, authorId, createdAt) {
  const trimmed = body.trim();

  if (!trimmed) {
    return incident;
  }

  return {
    ...incident,
    notes: [
      {
        id: makeId("note"),
        body: trimmed,
        authorId,
        createdAt: createdAt ?? new Date().toISOString(),
      },
      ...incident.notes,
    ],
    timeline: [
      createTimelineEvent({
        type: "note",
        message: "Incident note added.",
        actorId: authorId,
        createdAt,
      }),
      ...incident.timeline,
    ],
  };
}

export function canResolveIncident(incident) {
  return incident.steps.every((step) => !step.required || step.status === "done");
}

export function resolveIncident(incident, actorId, createdAt) {
  if (!canResolveIncident(incident)) {
    return {
      ok: false,
      reason: "REQUIRED_STEPS_OPEN",
      incident,
    };
  }

  const resolvedAt = createdAt ?? new Date().toISOString();

  return {
    ok: true,
    incident: {
      ...incident,
      status: "resolved",
      resolvedAt,
      timeline: [
        createTimelineEvent({
          type: "resolved",
          message: "Incident resolved.",
          actorId,
          createdAt: resolvedAt,
        }),
        ...incident.timeline,
      ],
    },
  };
}

function stepEventType(status) {
  if (status === "done") {
    return "step_done";
  }

  if (status === "blocked") {
    return "step_blocked";
  }

  return "step_updated";
}

function makeId(prefix) {
  if (globalThis.crypto?.randomUUID) {
    return `${prefix}-${globalThis.crypto.randomUUID().slice(0, 8)}`;
  }

  return `${prefix}-${Math.random().toString(16).slice(2, 10)}`;
}

