"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  Gauge,
  Layers3,
  ListChecks,
  PauseCircle,
  Play,
  Plus,
  Radio,
  Send,
  Server,
  ShieldCheck,
  TimerReset,
  UserRound,
  XCircle,
} from "lucide-react";
import { formatMinutes, formatShortDate } from "@/lib/format";
import {
  buildServiceHealth,
  getActiveIncidents,
  getAverageResolutionMinutes,
  getCriticalIncidentCount,
  getRunbookCoverage,
  getStepProgress,
} from "@/lib/incident-metrics";
import { initialIncidents, runbooks, services, teamMembers } from "@/lib/sample-data";
import {
  addIncidentNote,
  assignStep,
  canResolveIncident,
  createIncidentFromRunbook,
  resolveIncident,
  setStepStatus,
} from "@/lib/runbook-workflow";

const STORAGE_KEY = "runbook-studio-state-v1";
const CURRENT_USER_ID = "maya";

const panels = [
  { id: "command", label: "Command", icon: Radio },
  { id: "runbooks", label: "Runbooks", icon: BookOpen },
  { id: "services", label: "Services", icon: Server },
  { id: "reports", label: "Reports", icon: Gauge },
];

const stepStatuses = [
  { id: "pending", label: "Pending", icon: Circle },
  { id: "in_progress", label: "Active", icon: Play },
  { id: "blocked", label: "Blocked", icon: PauseCircle },
  { id: "done", label: "Done", icon: Check },
];

export function RunbookStudio() {
  const [incidents, setIncidents] = useState(initialIncidents);
  const [selectedIncidentId, setSelectedIncidentId] = useState(initialIncidents[0]?.id ?? null);
  const [activePanel, setActivePanel] = useState("command");
  const [noteDraft, setNoteDraft] = useState("");
  const [resolveError, setResolveError] = useState("");
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    const storedIncidents = loadStoredIncidents();

    queueMicrotask(() => {
      if (storedIncidents) {
        setIncidents(storedIncidents);
        setSelectedIncidentId(storedIncidents[0]?.id ?? null);
      }

      setStorageReady(true);
    });
  }, []);

  useEffect(() => {
    if (!storageReady) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ incidents }));
  }, [incidents, storageReady]);

  const activeIncidents = useMemo(() => getActiveIncidents(incidents), [incidents]);
  const serviceHealth = useMemo(() => buildServiceHealth(services, incidents), [incidents]);
  const selectedIncident = incidents.find((incident) => incident.id === selectedIncidentId) ?? incidents[0] ?? null;
  const selectedService = selectedIncident ? findService(selectedIncident.serviceId) : null;
  const selectedCommander = selectedIncident ? findMember(selectedIncident.commanderId) : null;
  const selectedProgress = selectedIncident ? getStepProgress(selectedIncident) : null;

  const metrics = [
    {
      label: "Active incidents",
      value: activeIncidents.length,
      detail: `${getCriticalIncidentCount(incidents)} SEV-1/2`,
      icon: AlertTriangle,
      tone: "amber",
    },
    {
      label: "Services degraded",
      value: serviceHealth.filter((service) => service.status !== "healthy").length,
      detail: `${services.length} tracked`,
      icon: Activity,
      tone: "rose",
    },
    {
      label: "Average resolve",
      value: formatMinutes(getAverageResolutionMinutes(incidents)),
      detail: "resolved incidents",
      icon: TimerReset,
      tone: "teal",
    },
    {
      label: "Runbook coverage",
      value: `${getRunbookCoverage(incidents)}%`,
      detail: `${runbooks.length} templates`,
      icon: ListChecks,
      tone: "indigo",
    },
  ];

  function updateIncident(incidentId, updater) {
    setResolveError("");
    setIncidents((current) => current.map((incident) => (incident.id === incidentId ? updater(incident) : incident)));
  }

  function handleLaunchRunbook(runbook) {
    const createdAt = new Date().toISOString();
    const incident = createIncidentFromRunbook({
      id: `inc-${Date.now().toString().slice(-6)}`,
      runbook,
      serviceId: runbook.serviceId,
      commanderId: CURRENT_USER_ID,
      createdAt,
    });

    setIncidents((current) => [incident, ...current]);
    setSelectedIncidentId(incident.id);
    setActivePanel("command");
  }

  function handleStepStatus(stepId, status) {
    if (!selectedIncident) {
      return;
    }

    updateIncident(selectedIncident.id, (incident) => setStepStatus(incident, stepId, status, CURRENT_USER_ID));
  }

  function handleAssignee(stepId, assigneeId) {
    if (!selectedIncident) {
      return;
    }

    updateIncident(selectedIncident.id, (incident) => assignStep(incident, stepId, assigneeId, CURRENT_USER_ID));
  }

  function handleAddNote(event) {
    event.preventDefault();

    if (!selectedIncident) {
      return;
    }

    updateIncident(selectedIncident.id, (incident) => addIncidentNote(incident, noteDraft, CURRENT_USER_ID));
    setNoteDraft("");
  }

  function handleResolve() {
    if (!selectedIncident) {
      return;
    }

    const result = resolveIncident(selectedIncident, CURRENT_USER_ID);

    if (!result.ok) {
      setResolveError("Required steps are still open.");
      return;
    }

    setIncidents((current) => current.map((incident) => (incident.id === selectedIncident.id ? result.incident : incident)));
    setResolveError("");
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Radio size={18} aria-hidden="true" />
          </div>
          <div>
            <strong>Runbook Studio</strong>
            <span>Incident ops</span>
          </div>
        </div>

        <nav className="nav-list" aria-label="Workspace">
          {panels.map((panel) => {
            const Icon = panel.icon;
            return (
              <button
                key={panel.id}
                className={activePanel === panel.id ? "nav-button active" : "nav-button"}
                type="button"
                onClick={() => setActivePanel(panel.id)}
              >
                <Icon size={18} aria-hidden="true" />
                <span>{panel.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <span className="pulse-dot" aria-hidden="true" />
          <span>{activeIncidents.length} open incidents</span>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">Operations</p>
            <h1>Incident command</h1>
          </div>
          <button className="primary-action" type="button" onClick={() => handleLaunchRunbook(runbooks[0])}>
            <Plus size={18} aria-hidden="true" />
            <span>New incident</span>
          </button>
        </header>

        <section className="metric-grid" aria-label="Operational metrics">
          {metrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <article className={`metric-card tone-${metric.tone}`} key={metric.label}>
                <div className="metric-icon">
                  <Icon size={18} aria-hidden="true" />
                </div>
                <div>
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                  <small>{metric.detail}</small>
                </div>
              </article>
            );
          })}
        </section>

        {activePanel === "command" && (
          <section className="command-grid">
            <IncidentQueue
              incidents={incidents}
              selectedIncidentId={selectedIncident?.id}
              onSelect={setSelectedIncidentId}
            />

            <IncidentWorkspace
              incident={selectedIncident}
              service={selectedService}
              commander={selectedCommander}
              progress={selectedProgress}
              resolveError={resolveError}
              noteDraft={noteDraft}
              onNoteDraft={setNoteDraft}
              onAddNote={handleAddNote}
              onResolve={handleResolve}
              onStepStatus={handleStepStatus}
              onAssignee={handleAssignee}
            />

            <aside className="side-stack">
              <RunbookLauncher onLaunch={handleLaunchRunbook} />
              <ServiceHealth services={serviceHealth} />
            </aside>
          </section>
        )}

        {activePanel === "runbooks" && <RunbookLibrary onLaunch={handleLaunchRunbook} />}
        {activePanel === "services" && <ServiceBoard services={serviceHealth} />}
        {activePanel === "reports" && <Reports incidents={incidents} />}
      </main>
    </div>
  );
}

function IncidentQueue({ incidents, selectedIncidentId, onSelect }) {
  return (
    <section className="panel incident-queue" aria-labelledby="incident-queue-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Queue</p>
          <h2 id="incident-queue-heading">Incidents</h2>
        </div>
      </div>

      <div className="queue-list">
        {incidents.map((incident) => {
          const service = findService(incident.serviceId);
          const commander = findMember(incident.commanderId);

          return (
            <button
              key={incident.id}
              className={selectedIncidentId === incident.id ? "queue-item active" : "queue-item"}
              type="button"
              onClick={() => onSelect(incident.id)}
            >
              <span className="queue-title-row">
                <SeverityBadge value={incident.severity} />
                <StatusBadge value={incident.status} />
              </span>
              <strong>{incident.title}</strong>
              <span>{service?.name ?? "Unknown service"} / {commander?.name ?? "Unassigned"}</span>
              <small>{formatShortDate(incident.startedAt)}</small>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function IncidentWorkspace({
  incident,
  service,
  commander,
  progress,
  resolveError,
  noteDraft,
  onNoteDraft,
  onAddNote,
  onResolve,
  onStepStatus,
  onAssignee,
}) {
  if (!incident) {
    return (
      <section className="panel workspace-empty">
        <AlertTriangle size={22} aria-hidden="true" />
        <h2>No incidents</h2>
      </section>
    );
  }

  const readyToResolve = canResolveIncident(incident);

  return (
    <section className="panel incident-workspace" aria-labelledby="workspace-heading">
      <div className="workspace-header">
        <div>
          <div className="badge-row">
            <SeverityBadge value={incident.severity} />
            <StatusBadge value={incident.status} />
          </div>
          <h2 id="workspace-heading">{incident.title}</h2>
          <div className="meta-row">
            <span><Server size={14} aria-hidden="true" />{service?.name ?? "Unknown service"}</span>
            <span><UserRound size={14} aria-hidden="true" />{commander?.name ?? "Unassigned"}</span>
            <span><Clock3 size={14} aria-hidden="true" />{formatShortDate(incident.startedAt)}</span>
          </div>
        </div>

        <button className="resolve-button" type="button" onClick={onResolve} disabled={!readyToResolve || incident.status === "resolved"}>
          <ShieldCheck size={18} aria-hidden="true" />
          <span>{incident.status === "resolved" ? "Resolved" : "Resolve"}</span>
        </button>
      </div>

      <div className="progress-row">
        <span>{progress.done}/{progress.total} steps</span>
        <div className="progress-track" aria-hidden="true">
          <span style={{ width: `${progress.percent}%` }} />
        </div>
        <strong>{progress.percent}%</strong>
      </div>

      {resolveError && <p className="inline-error">{resolveError}</p>}

      <div className="workspace-columns">
        <div className="step-list" aria-label="Incident steps">
          {incident.steps.length === 0 && (
            <div className="empty-state">
              <CheckCircle2 size={18} aria-hidden="true" />
              <span>No open checklist steps.</span>
            </div>
          )}

          {incident.steps.map((step) => (
            <article className={`step-item step-${step.status}`} key={step.id}>
              <div className="step-main">
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.detail}</p>
                </div>
                <StatusBadge value={step.status} />
              </div>

              <div className="step-controls">
                <select value={step.assigneeId ?? ""} onChange={(event) => onAssignee(step.id, event.target.value || null)} aria-label={`Assign ${step.title}`}>
                  <option value="">Unassigned</option>
                  {teamMembers.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>

                <div className="segmented" aria-label={`Set status for ${step.title}`}>
                  {stepStatuses.map((status) => {
                    const Icon = status.icon;
                    return (
                      <button
                        key={status.id}
                        className={step.status === status.id ? "active" : ""}
                        type="button"
                        onClick={() => onStepStatus(step.id, status.id)}
                      >
                        <Icon size={14} aria-hidden="true" />
                        <span>{status.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="activity-column">
          <form className="note-form" onSubmit={onAddNote}>
            <textarea
              value={noteDraft}
              onChange={(event) => onNoteDraft(event.target.value)}
              placeholder="Add incident note"
              rows={3}
            />
            <button type="submit" aria-label="Add note">
              <Send size={17} aria-hidden="true" />
            </button>
          </form>

          <div className="timeline" aria-label="Timeline">
            {incident.notes.map((note) => {
              const author = findMember(note.authorId);

              return (
                <article className="timeline-item note" key={note.id}>
                  <span className="timeline-dot" aria-hidden="true" />
                  <div>
                    <strong>{author?.name ?? "Unknown"}</strong>
                    <p>{note.body}</p>
                    <small>{formatShortDate(note.createdAt)}</small>
                  </div>
                </article>
              );
            })}

            {incident.timeline.map((event) => {
              const actor = findMember(event.actorId);

              return (
                <article className="timeline-item" key={event.id}>
                  <span className="timeline-dot" aria-hidden="true" />
                  <div>
                    <strong>{actor?.name ?? "System"}</strong>
                    <p>{event.message}</p>
                    <small>{formatShortDate(event.createdAt)}</small>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function RunbookLauncher({ onLaunch }) {
  return (
    <section className="panel compact-panel" aria-labelledby="launcher-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Runbooks</p>
          <h2 id="launcher-heading">Launch</h2>
        </div>
      </div>

      <div className="runbook-list">
        {runbooks.slice(0, 3).map((runbook) => (
          <article className="runbook-row" key={runbook.id}>
            <div>
              <strong>{runbook.title}</strong>
              <span>{findService(runbook.serviceId)?.name} / {runbook.defaultSeverity}</span>
            </div>
            <button type="button" onClick={() => onLaunch(runbook)} aria-label={`Launch ${runbook.title}`}>
              <Plus size={16} aria-hidden="true" />
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function ServiceHealth({ services: serviceHealth }) {
  return (
    <section className="panel compact-panel" aria-labelledby="service-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Services</p>
          <h2 id="service-heading">Health</h2>
        </div>
      </div>

      <div className="service-list">
        {serviceHealth.map((service) => (
          <article className="service-row" key={service.id}>
            <div>
              <strong>{service.name}</strong>
              <span>{service.owner}</span>
            </div>
            <StatusBadge value={service.status} />
          </article>
        ))}
      </div>
    </section>
  );
}

function RunbookLibrary({ onLaunch }) {
  return (
    <section className="library-grid" aria-label="Runbook library">
      {runbooks.map((runbook) => (
        <article className="panel library-card" key={runbook.id}>
          <div className="library-card-header">
            <div>
              <p className="eyebrow">{findService(runbook.serviceId)?.name}</p>
              <h2>{runbook.title}</h2>
            </div>
            <button type="button" onClick={() => onLaunch(runbook)} aria-label={`Launch ${runbook.title}`}>
              <Plus size={17} aria-hidden="true" />
            </button>
          </div>
          <p>{runbook.summary}</p>
          <div className="library-meta">
            <span>{runbook.defaultSeverity}</span>
            <span>{runbook.estimatedMinutes}m</span>
            <span>{runbook.steps.length} steps</span>
          </div>
        </article>
      ))}
    </section>
  );
}

function ServiceBoard({ services: serviceHealth }) {
  return (
    <section className="panel table-panel" aria-labelledby="services-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Catalog</p>
          <h2 id="services-heading">Services</h2>
        </div>
      </div>

      <div className="service-table" role="table">
        <div className="table-row table-head" role="row">
          <span role="columnheader">Service</span>
          <span role="columnheader">Owner</span>
          <span role="columnheader">Tier</span>
          <span role="columnheader">SLO</span>
          <span role="columnheader">Status</span>
        </div>
        {serviceHealth.map((service) => (
          <div className="table-row" role="row" key={service.id}>
            <strong role="cell">{service.name}</strong>
            <span role="cell">{service.owner}</span>
            <span role="cell">{service.tier}</span>
            <span role="cell">{service.slo}</span>
            <span role="cell"><StatusBadge value={service.status} /></span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Reports({ incidents }) {
  const resolved = incidents.filter((incident) => incident.status === "resolved");
  const active = getActiveIncidents(incidents);

  return (
    <section className="reports-grid" aria-label="Incident reports">
      <article className="panel report-panel">
        <p className="eyebrow">Resolution</p>
        <h2>{formatMinutes(getAverageResolutionMinutes(incidents))}</h2>
        <span>Average MTTR</span>
      </article>
      <article className="panel report-panel">
        <p className="eyebrow">Load</p>
        <h2>{active.length}</h2>
        <span>Open incidents</span>
      </article>
      <article className="panel report-panel">
        <p className="eyebrow">History</p>
        <h2>{resolved.length}</h2>
        <span>Resolved incidents</span>
      </article>
      <article className="panel report-panel wide">
        <p className="eyebrow">Recent resolved</p>
        {resolved.map((incident) => (
          <div className="resolved-row" key={incident.id}>
            <strong>{incident.title}</strong>
            <span>{incident.summary || "Summary pending"}</span>
          </div>
        ))}
      </article>
    </section>
  );
}

function StatusBadge({ value }) {
  const label = {
    active: "Active",
    monitoring: "Monitoring",
    resolved: "Resolved",
    pending: "Pending",
    in_progress: "Active",
    blocked: "Blocked",
    done: "Done",
    healthy: "Healthy",
    degraded: "Degraded",
    down: "Down",
  }[value] ?? value;

  return <span className={`status-badge status-${value}`}>{label}</span>;
}

function SeverityBadge({ value }) {
  return <span className={`severity-badge severity-${value.toLowerCase()}`}>{value}</span>;
}

function findService(id) {
  return services.find((service) => service.id === id);
}

function findMember(id) {
  return teamMembers.find((member) => member.id === id);
}

function loadStoredIncidents() {
  if (typeof window === "undefined") {
    return null;
  }

  const saved = window.localStorage.getItem(STORAGE_KEY);

  if (!saved) {
    return null;
  }

  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed.incidents) ? parsed.incidents : null;
  } catch {
    return null;
  }
}
