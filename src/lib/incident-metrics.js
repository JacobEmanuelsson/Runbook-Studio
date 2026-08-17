export function getActiveIncidents(incidents) {
  return incidents.filter((incident) => incident.status !== "resolved");
}

export function getCriticalIncidentCount(incidents) {
  return getActiveIncidents(incidents).filter((incident) => incident.severity === "SEV-1" || incident.severity === "SEV-2").length;
}

export function getAverageResolutionMinutes(incidents) {
  const resolved = incidents.filter((incident) => incident.startedAt && incident.resolvedAt);

  if (resolved.length === 0) {
    return 0;
  }

  const total = resolved.reduce((sum, incident) => {
    return sum + minutesBetween(incident.startedAt, incident.resolvedAt);
  }, 0);

  return Math.round(total / resolved.length);
}

export function getRunbookCoverage(incidents) {
  if (incidents.length === 0) {
    return 0;
  }

  const withRunbook = incidents.filter((incident) => Boolean(incident.runbookId)).length;
  return Math.round((withRunbook / incidents.length) * 100);
}

export function buildServiceHealth(services, incidents) {
  return services.map((service) => {
    const openIncidents = getActiveIncidents(incidents).filter((incident) => incident.serviceId === service.id);

    return {
      ...service,
      openIncidents: openIncidents.length,
      activeSeverity: openIncidents[0]?.severity ?? null,
    };
  });
}

export function getStepProgress(incident) {
  if (!incident?.steps?.length) {
    return {
      total: 0,
      done: 0,
      percent: 100,
    };
  }

  const done = incident.steps.filter((step) => step.status === "done").length;

  return {
    total: incident.steps.length,
    done,
    percent: Math.round((done / incident.steps.length) * 100),
  };
}

export function minutesBetween(start, end) {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();

  return Math.max(0, Math.round((endMs - startMs) / 60_000));
}

