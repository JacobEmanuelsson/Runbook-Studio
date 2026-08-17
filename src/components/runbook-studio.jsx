"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  FilePlus2,
  Gauge,
  ListChecks,
  LogIn,
  LogOut,
  PauseCircle,
  Play,
  Plus,
  Radio,
  Save,
  Send,
  Server,
  ShieldCheck,
  TimerReset,
  Trash2,
  UserRound,
} from "lucide-react";
import {
  addIncidentNoteAction,
  assignIncidentStepAction,
  launchIncidentAction,
  resolveIncidentAction,
  updateIncidentStepAction,
} from "@/server/incidents/incident-actions";
import { deleteRunbookAction, saveRunbookAction } from "@/server/runbooks/runbook-actions";
import { authClient } from "@/lib/auth-client";
import { saveRunbookSchema } from "@/domain/runbooks/schema";
import { formatMinutes, formatShortDate } from "@/lib/format";
import {
  buildServiceHealth,
  getActiveIncidents,
  getAverageResolutionMinutes,
  getCriticalIncidentCount,
  getRunbookCoverage,
  getStepProgress,
} from "@/lib/incident-metrics";
import {
  initialIncidents as demoIncidents,
  runbooks as demoRunbooks,
  services as demoServices,
  teamMembers as demoTeamMembers,
} from "@/lib/sample-data";
import {
  addIncidentNote,
  assignStep,
  canResolveIncident,
  createIncidentFromRunbook,
  resolveIncident,
  setStepStatus,
} from "@/lib/runbook-workflow";

const STORAGE_KEY = "runbook-studio-state-v1";
const DEMO_USER_ID = "maya";
const demoDashboard = {
  organization: null,
  services: demoServices,
  runbooks: demoRunbooks,
  incidents: demoIncidents,
  teamMembers: demoTeamMembers,
};

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

export function RunbookStudio({ currentUser = null, dashboard = demoDashboard, loadError = "", mode = "demo" }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isMutating, setIsMutating] = useState(false);
  const isDatabaseMode = mode === "database";
  const isBusy = isPending || isMutating;
  const servicesData = dashboard.services ?? demoServices;
  const membersData = dashboard.teamMembers ?? demoTeamMembers;
  const actorId = currentUser?.id ?? DEMO_USER_ID;
  const workspaceName = dashboard.organization?.name ?? "Local demo";
  const [incidents, setIncidents] = useState(dashboard.incidents ?? demoIncidents);
  const [runbooksState, setRunbooksState] = useState(dashboard.runbooks ?? demoRunbooks);
  const runbooksData = runbooksState;
  const [selectedIncidentId, setSelectedIncidentId] = useState(dashboard.incidents?.[0]?.id ?? demoIncidents[0]?.id ?? null);
  const [selectedRunbookId, setSelectedRunbookId] = useState((dashboard.runbooks ?? demoRunbooks)[0]?.id ?? null);
  const [runbookDraft, setRunbookDraft] = useState(() =>
    cloneRunbook((dashboard.runbooks ?? demoRunbooks)[0] ?? createBlankRunbook(servicesData)),
  );
  const [activePanel, setActivePanel] = useState("command");
  const [noteDraft, setNoteDraft] = useState("");
  const [resolveError, setResolveError] = useState("");
  const [actionError, setActionError] = useState("");
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    const storedDashboard = isDatabaseMode ? null : loadStoredDashboard();
    const nextIncidents = isDatabaseMode ? dashboard.incidents ?? [] : storedDashboard?.incidents ?? dashboard.incidents ?? demoIncidents;
    const nextRunbooks = isDatabaseMode ? dashboard.runbooks ?? [] : storedDashboard?.runbooks ?? dashboard.runbooks ?? demoRunbooks;
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      setIncidents(nextIncidents);
      setRunbooksState(nextRunbooks);
      setSelectedIncidentId((currentId) => {
        if (currentId && nextIncidents.some((incident) => incident.id === currentId)) {
          return currentId;
        }

        return nextIncidents[0]?.id ?? null;
      });
      setSelectedRunbookId((currentId) => {
        if (currentId && nextRunbooks.some((runbook) => runbook.id === currentId)) {
          return currentId;
        }

        return nextRunbooks[0]?.id ?? null;
      });
      setStorageReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [dashboard, isDatabaseMode]);

  useEffect(() => {
    const selectedRunbook = runbooksData.find((runbook) => runbook.id === selectedRunbookId);
    const nextDraft = cloneRunbook(selectedRunbook ?? createBlankRunbook(servicesData));
    let cancelled = false;

    queueMicrotask(() => {
      if (!cancelled) {
        setRunbookDraft(nextDraft);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [runbooksData, selectedRunbookId, servicesData]);

  useEffect(() => {
    if (!storageReady || isDatabaseMode) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ incidents, runbooks: runbooksData }));
  }, [incidents, isDatabaseMode, runbooksData, storageReady]);

  const activeIncidents = useMemo(() => getActiveIncidents(incidents), [incidents]);
  const serviceHealth = useMemo(() => buildServiceHealth(servicesData, incidents), [incidents, servicesData]);
  const selectedIncident = incidents.find((incident) => incident.id === selectedIncidentId) ?? incidents[0] ?? null;
  const selectedService = selectedIncident ? findService(servicesData, selectedIncident.serviceId) : null;
  const selectedCommander = selectedIncident ? findMember(membersData, selectedIncident.commanderId) : null;
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
      detail: `${servicesData.length} tracked`,
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
      detail: `${runbooksData.length} templates`,
      icon: ListChecks,
      tone: "indigo",
    },
  ];

  function updateIncident(incidentId, updater) {
    setResolveError("");
    setActionError("");
    setIncidents((current) => current.map((incident) => (incident.id === incidentId ? updater(incident) : incident)));
  }

  function handleNewRunbook() {
    setActionError("");
    setSelectedRunbookId(null);
    setRunbookDraft(createBlankRunbook(servicesData));
  }

  function handleSelectRunbook(runbookId) {
    setActionError("");
    setSelectedRunbookId(runbookId);
  }

  function handleRunbookField(field, value) {
    setActionError("");
    setRunbookDraft((current) => ({ ...current, [field]: value }));
  }

  function handleRunbookStep(index, field, value) {
    setActionError("");
    setRunbookDraft((current) => ({
      ...current,
      steps: current.steps.map((step, stepIndex) => (stepIndex === index ? { ...step, [field]: value } : step)),
    }));
  }

  function handleAddRunbookStep() {
    setActionError("");
    setRunbookDraft((current) => ({
      ...current,
      steps: [
        ...current.steps,
        {
          id: nextDraftStepId(current.steps),
          title: "New checklist step",
          detail: "Describe the operational check or mitigation.",
          role: "Incident commander",
          required: true,
          timeboxMinutes: 5,
        },
      ],
    }));
  }

  function handleMoveRunbookStep(index, direction) {
    setActionError("");
    setRunbookDraft((current) => {
      const nextIndex = index + direction;

      if (nextIndex < 0 || nextIndex >= current.steps.length) {
        return current;
      }

      const steps = [...current.steps];
      const [step] = steps.splice(index, 1);
      steps.splice(nextIndex, 0, step);

      return { ...current, steps };
    });
  }

  function handleRemoveRunbookStep(index) {
    setActionError("");
    setRunbookDraft((current) => {
      if (current.steps.length <= 1) {
        return current;
      }

      return {
        ...current,
        steps: current.steps.filter((_, stepIndex) => stepIndex !== index),
      };
    });
  }

  function handleSaveRunbook(event) {
    event.preventDefault();
    const parsed = saveRunbookSchema.safeParse({
      ...runbookDraft,
      id: selectedRunbookId,
      steps: normalizeRunbookSteps(runbookDraft.steps),
    });

    if (!parsed.success) {
      setActionError(parsed.error.issues[0]?.message ?? "Runbook is missing required fields.");
      return;
    }

    const savedRunbook = {
      ...parsed.data,
      id: parsed.data.id ?? makeLocalRunbookId(parsed.data.title, runbooksData),
      tags: [],
    };

    if (isDatabaseMode) {
      runServerAction(
        () =>
          saveRunbookAction({
            ...parsed.data,
            id: selectedRunbookId,
          }),
        {
          onSuccess: (result) => setSelectedRunbookId(result.runbookId),
        },
      );
      return;
    }

    setRunbooksState((current) => upsertRunbook(current, savedRunbook));
    setSelectedRunbookId(savedRunbook.id);
    setActionError("");
  }

  function handleDeleteRunbook() {
    if (!selectedRunbookId) {
      return;
    }

    if (isDatabaseMode) {
      runServerAction(() => deleteRunbookAction({ runbookId: selectedRunbookId }), {
        onSuccess: () => setSelectedRunbookId(null),
      });
      return;
    }

    const nextRunbooks = runbooksData.filter((runbook) => runbook.id !== selectedRunbookId);
    setRunbooksState(nextRunbooks);
    setSelectedRunbookId(nextRunbooks[0]?.id ?? null);
    setActionError("");
  }

  function handleLaunchRunbook(runbook) {
    if (!runbook) {
      return;
    }

    if (isDatabaseMode) {
      runServerAction(
        () =>
          launchIncidentAction({
            title: runbook.title,
            serviceId: runbook.serviceId,
            runbookId: runbook.id,
            severity: runbook.defaultSeverity,
          }),
        {
          onSuccess: (result) => {
            setSelectedIncidentId(result.incidentId);
            setActivePanel("command");
          },
        },
      );
      return;
    }

    const incident = createIncidentFromRunbook({
      runbook,
      serviceId: runbook.serviceId,
      commanderId: actorId,
    });

    setIncidents((current) => [incident, ...current]);
    setSelectedIncidentId(incident.id);
    setActivePanel("command");
  }

  function handleStepStatus(stepId, status) {
    if (!selectedIncident) {
      return;
    }

    if (isDatabaseMode) {
      runServerAction(() =>
        updateIncidentStepAction({
          incidentId: selectedIncident.id,
          stepId,
          status,
        }),
      );
      return;
    }

    updateIncident(selectedIncident.id, (incident) => setStepStatus(incident, stepId, status, actorId));
  }

  function handleAssignee(stepId, assigneeId) {
    if (!selectedIncident) {
      return;
    }

    if (isDatabaseMode) {
      runServerAction(() =>
        assignIncidentStepAction({
          incidentId: selectedIncident.id,
          stepId,
          assigneeId,
        }),
      );
      return;
    }

    updateIncident(selectedIncident.id, (incident) => assignStep(incident, stepId, assigneeId, actorId));
  }

  function handleAddNote(event) {
    event.preventDefault();
    const body = noteDraft.trim();

    if (!selectedIncident || !body) {
      return;
    }

    if (isDatabaseMode) {
      runServerAction(
        () =>
          addIncidentNoteAction({
            incidentId: selectedIncident.id,
            body,
          }),
        {
          onSuccess: () => setNoteDraft(""),
        },
      );
      return;
    }

    updateIncident(selectedIncident.id, (incident) => addIncidentNote(incident, body, actorId));
    setNoteDraft("");
  }

  function handleResolve() {
    if (!selectedIncident) {
      return;
    }

    if (isDatabaseMode) {
      setResolveError("");
      runServerAction(
        () =>
          resolveIncidentAction({
            incidentId: selectedIncident.id,
          }),
        {
          onError: setResolveError,
        },
      );
      return;
    }

    const result = resolveIncident(selectedIncident, actorId);

    if (!result.ok) {
      setResolveError("Required steps are still open.");
      return;
    }

    setIncidents((current) => current.map((incident) => (incident.id === selectedIncident.id ? result.incident : incident)));
    setResolveError("");
  }

  function handleSignOut() {
    setActionError("");
    setIsMutating(true);
    startTransition(() => {
      authClient
        .signOut()
        .then(() => {
          router.refresh();
        })
        .catch((error) => {
          console.error(error);
          setActionError("Could not sign out.");
        })
        .finally(() => {
          setIsMutating(false);
        });
    });
  }

  function runServerAction(action, { onSuccess, onError } = {}) {
    setActionError("");
    setResolveError("");
    setIsMutating(true);
    startTransition(() => {
      action()
        .then((result) => {
          if (!result?.ok) {
            const message = result?.error ?? "Action failed.";
            setActionError(message);
            onError?.(message);
            return;
          }

          onSuccess?.(result);
          router.refresh();
        })
        .catch((error) => {
          console.error(error);
          const message = "Action failed.";
          setActionError(message);
          onError?.(message);
        })
        .finally(() => {
          setIsMutating(false);
        });
    });
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
            <p className="eyebrow">{workspaceName}</p>
            <h1>Incident command</h1>
          </div>
          <div className="topbar-actions">
            <span className={isDatabaseMode ? "mode-chip saved" : "mode-chip"}>{isDatabaseMode ? "Saved workspace" : "Demo mode"}</span>
            {currentUser ? (
              <button className="secondary-action" type="button" onClick={handleSignOut} disabled={isBusy}>
                <LogOut size={18} aria-hidden="true" />
                <span>Sign out</span>
              </button>
            ) : (
              <Link className="secondary-action" href="/sign-in">
                <LogIn size={18} aria-hidden="true" />
                <span>Sign in</span>
              </Link>
            )}
            <button
              className="primary-action"
              type="button"
              onClick={() => handleLaunchRunbook(runbooksData[0])}
              disabled={isBusy || !runbooksData[0]}
            >
              <Plus size={18} aria-hidden="true" />
              <span>New incident</span>
            </button>
          </div>
        </header>

        {(loadError || actionError) && <p className="app-alert">{actionError || loadError}</p>}

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
              services={servicesData}
              teamMembers={membersData}
              onSelect={setSelectedIncidentId}
            />

            <IncidentWorkspace
              incident={selectedIncident}
              service={selectedService}
              commander={selectedCommander}
              progress={selectedProgress}
              teamMembers={membersData}
              pending={isBusy}
              resolveError={resolveError}
              noteDraft={noteDraft}
              onNoteDraft={setNoteDraft}
              onAddNote={handleAddNote}
              onResolve={handleResolve}
              onStepStatus={handleStepStatus}
              onAssignee={handleAssignee}
            />

            <aside className="side-stack">
              <RunbookLauncher runbooks={runbooksData} services={servicesData} pending={isBusy} onLaunch={handleLaunchRunbook} />
              <ServiceHealth services={serviceHealth} />
            </aside>
          </section>
        )}

        {activePanel === "runbooks" && (
          <RunbookLibrary
            draft={runbookDraft}
            pending={isBusy}
            runbooks={runbooksData}
            selectedRunbookId={selectedRunbookId}
            services={servicesData}
            onAddStep={handleAddRunbookStep}
            onDelete={handleDeleteRunbook}
            onDraftField={handleRunbookField}
            onLaunch={handleLaunchRunbook}
            onMoveStep={handleMoveRunbookStep}
            onNew={handleNewRunbook}
            onRemoveStep={handleRemoveRunbookStep}
            onSave={handleSaveRunbook}
            onSelect={handleSelectRunbook}
            onStepField={handleRunbookStep}
          />
        )}
        {activePanel === "services" && <ServiceBoard services={serviceHealth} />}
        {activePanel === "reports" && <Reports incidents={incidents} />}
      </main>
    </div>
  );
}

function IncidentQueue({ incidents, selectedIncidentId, services, teamMembers, onSelect }) {
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
          const service = findService(services, incident.serviceId);
          const commander = findMember(teamMembers, incident.commanderId);

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
  teamMembers,
  pending,
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

        <button
          className="resolve-button"
          type="button"
          onClick={onResolve}
          disabled={pending || !readyToResolve || incident.status === "resolved"}
        >
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
                <select
                  value={step.assigneeId ?? ""}
                  onChange={(event) => onAssignee(step.id, event.target.value || null)}
                  aria-label={`Assign ${step.title}`}
                  disabled={pending}
                >
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
                        disabled={pending}
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
              disabled={pending}
            />
            <button type="submit" aria-label="Add note" disabled={pending || !noteDraft.trim()}>
              <Send size={17} aria-hidden="true" />
            </button>
          </form>

          <div className="timeline" aria-label="Timeline">
            {incident.notes.map((note) => {
              const author = findMember(teamMembers, note.authorId);

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
              const actor = findMember(teamMembers, event.actorId);

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

function RunbookLauncher({ runbooks, services, pending, onLaunch }) {
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
              <span>{findService(services, runbook.serviceId)?.name} / {runbook.defaultSeverity}</span>
            </div>
            <button type="button" onClick={() => onLaunch(runbook)} aria-label={`Launch ${runbook.title}`} disabled={pending}>
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

function RunbookLibrary({
  draft,
  pending,
  runbooks,
  selectedRunbookId,
  services,
  onAddStep,
  onDelete,
  onDraftField,
  onLaunch,
  onMoveStep,
  onNew,
  onRemoveStep,
  onSave,
  onSelect,
  onStepField,
}) {
  return (
    <section className="runbook-workbench" aria-label="Runbook editor">
      <div className="runbook-catalog" aria-label="Runbook library">
        <div className="panel catalog-heading">
          <div>
            <p className="eyebrow">Templates</p>
            <h2>Runbooks</h2>
          </div>
          <button className="icon-action" type="button" onClick={onNew} aria-label="New runbook" disabled={pending}>
            <FilePlus2 size={17} aria-hidden="true" />
          </button>
        </div>

        {runbooks.map((runbook) => (
          <article className={selectedRunbookId === runbook.id ? "panel library-card selected" : "panel library-card"} key={runbook.id}>
            <button className="library-select" type="button" onClick={() => onSelect(runbook.id)}>
              <span className="eyebrow">{findService(services, runbook.serviceId)?.name}</span>
              <strong>{runbook.title}</strong>
              <span>{runbook.summary}</span>
            </button>
            <div className="library-meta">
              <span>{runbook.defaultSeverity}</span>
              <span>{runbook.estimatedMinutes}m</span>
              <span>{runbook.steps.length} steps</span>
            </div>
            <button type="button" onClick={() => onLaunch(runbook)} aria-label={`Launch ${runbook.title}`} disabled={pending}>
              <Plus size={17} aria-hidden="true" />
            </button>
          </article>
        ))}
      </div>

      <form className="panel runbook-editor" onSubmit={onSave}>
        <div className="editor-heading">
          <div>
            <p className="eyebrow">Template</p>
            <h2>{selectedRunbookId ? "Edit runbook" : "New runbook"}</h2>
          </div>
          <div className="editor-actions">
            <button className="secondary-action compact" type="button" onClick={onDelete} disabled={pending || !selectedRunbookId}>
              <Trash2 size={16} aria-hidden="true" />
              <span>Delete</span>
            </button>
            <button className="primary-action compact" type="submit" disabled={pending}>
              <Save size={16} aria-hidden="true" />
              <span>Save</span>
            </button>
          </div>
        </div>

        <div className="editor-grid">
          <label className="field-label">
            Title
            <input value={draft.title} onChange={(event) => onDraftField("title", event.target.value)} />
          </label>
          <label className="field-label">
            Service
            <select value={draft.serviceId} onChange={(event) => onDraftField("serviceId", event.target.value)}>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Severity
            <select value={draft.defaultSeverity} onChange={(event) => onDraftField("defaultSeverity", event.target.value)}>
              {["SEV-1", "SEV-2", "SEV-3", "SEV-4"].map((severity) => (
                <option key={severity} value={severity}>
                  {severity}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Estimate
            <input
              min="1"
              max="480"
              type="number"
              value={draft.estimatedMinutes}
              onChange={(event) => onDraftField("estimatedMinutes", event.target.value)}
            />
          </label>
          <label className="field-label editor-summary">
            Summary
            <textarea value={draft.summary} onChange={(event) => onDraftField("summary", event.target.value)} rows={3} />
          </label>
        </div>

        <div className="editor-section-heading">
          <div>
            <p className="eyebrow">Checklist</p>
            <h3>Steps</h3>
          </div>
          <button className="secondary-action compact" type="button" onClick={onAddStep} disabled={pending}>
            <Plus size={16} aria-hidden="true" />
            <span>Add step</span>
          </button>
        </div>

        <div className="editor-step-list">
          {draft.steps.map((step, index) => (
            <article className="editor-step" key={step.id ?? `step-${index}`}>
              <div className="editor-step-heading">
                <span>Step {index + 1}</span>
                <div className="step-icon-actions">
                  <button type="button" onClick={() => onMoveStep(index, -1)} aria-label={`Move step ${index + 1} up`} disabled={pending || index === 0}>
                    <ArrowUp size={15} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onMoveStep(index, 1)}
                    aria-label={`Move step ${index + 1} down`}
                    disabled={pending || index === draft.steps.length - 1}
                  >
                    <ArrowDown size={15} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveStep(index)}
                    aria-label={`Remove step ${index + 1}`}
                    disabled={pending || draft.steps.length <= 1}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="editor-step-grid">
                <label className="field-label">
                  Title
                  <input value={step.title} onChange={(event) => onStepField(index, "title", event.target.value)} />
                </label>
                <label className="field-label">
                  Role
                  <input value={step.role} onChange={(event) => onStepField(index, "role", event.target.value)} />
                </label>
                <label className="field-label">
                  Timebox
                  <input
                    min="1"
                    max="240"
                    type="number"
                    value={step.timeboxMinutes ?? ""}
                    onChange={(event) => onStepField(index, "timeboxMinutes", event.target.value)}
                  />
                </label>
                <label className="field-label step-detail">
                  Detail
                  <textarea value={step.detail} onChange={(event) => onStepField(index, "detail", event.target.value)} rows={3} />
                </label>
                <label className="check-label">
                  <input
                    checked={step.required}
                    type="checkbox"
                    onChange={(event) => onStepField(index, "required", event.target.checked)}
                  />
                  <span>Required</span>
                </label>
              </div>
            </article>
          ))}
        </div>
      </form>
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
  if (!value) {
    return null;
  }

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
  if (!value) {
    return null;
  }

  return <span className={`severity-badge severity-${value.toLowerCase()}`}>{value}</span>;
}

function findService(services, id) {
  return services.find((service) => service.id === id);
}

function findMember(teamMembers, id) {
  return teamMembers.find((member) => member.id === id);
}

function cloneRunbook(runbook) {
  return {
    ...runbook,
    steps: runbook.steps.map((step) => ({ ...step })),
  };
}

function createBlankRunbook(services) {
  return {
    id: null,
    title: "New incident runbook",
    summary: "Describe when this runbook should be launched and what it protects.",
    serviceId: services[0]?.id ?? "",
    defaultSeverity: "SEV-3",
    estimatedMinutes: 30,
    tags: [],
    steps: [
      {
        id: "draft-step-1",
        title: "Confirm customer impact",
        detail: "Check service health, error rates, and user-facing symptoms.",
        role: "Incident commander",
        required: true,
        timeboxMinutes: 5,
      },
    ],
  };
}

function normalizeRunbookSteps(steps) {
  const usedIds = new Set();

  return steps.map((step, index) => {
    const baseId = slugify(step.title) || `step-${index + 1}`;
    let id = step.id || baseId;

    if (usedIds.has(id)) {
      id = baseId;
    }

    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }

    usedIds.add(id);

    return {
      ...step,
      id,
      title: step.title.trim(),
      detail: step.detail.trim(),
      role: step.role.trim(),
      required: Boolean(step.required),
    };
  });
}

function nextDraftStepId(steps) {
  let index = steps.length + 1;
  let id = `draft-step-${index}`;

  while (steps.some((step) => step.id === id)) {
    index += 1;
    id = `draft-step-${index}`;
  }

  return id;
}

function makeLocalRunbookId(title, runbooks) {
  const baseId = slugify(title) || "custom-runbook";
  let id = baseId;
  let suffix = 2;

  while (runbooks.some((runbook) => runbook.id === id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }

  return id;
}

function upsertRunbook(runbooks, runbook) {
  if (runbooks.some((current) => current.id === runbook.id)) {
    return runbooks.map((current) => (current.id === runbook.id ? runbook : current));
  }

  return [runbook, ...runbooks];
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function loadStoredDashboard() {
  if (typeof window === "undefined") {
    return null;
  }

  const saved = window.localStorage.getItem(STORAGE_KEY);

  if (!saved) {
    return null;
  }

  try {
    const parsed = JSON.parse(saved);
    return {
      incidents: Array.isArray(parsed.incidents) ? parsed.incidents : null,
      runbooks: Array.isArray(parsed.runbooks) ? parsed.runbooks : null,
    };
  } catch {
    return null;
  }
}
