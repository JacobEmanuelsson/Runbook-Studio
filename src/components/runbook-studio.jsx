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
  Clipboard,
  Clock3,
  FilePlus2,
  Gauge,
  ListChecks,
  LogIn,
  LogOut,
  MailPlus,
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
  UsersRound,
  X,
} from "lucide-react";
import {
  addIncidentNoteAction,
  assignIncidentStepAction,
  launchIncidentAction,
  resolveIncidentAction,
  saveIncidentReportAction,
  updateIncidentStepAction,
} from "@/server/incidents/incident-actions";
import { deleteRunbookAction, saveRunbookAction } from "@/server/runbooks/runbook-actions";
import { deleteServiceAction, saveServiceAction } from "@/server/services/service-actions";
import { cancelInvitationAction, createInvitationAction, updateMemberRoleAction } from "@/server/team/team-actions";
import { authClient } from "@/lib/auth-client";
import { incidentReportSchema } from "@/domain/incidents/schema";
import { saveRunbookSchema } from "@/domain/runbooks/schema";
import { saveServiceSchema } from "@/domain/services/schema";
import { createInvitationSchema, updateMemberRoleSchema } from "@/domain/team/schema";
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
  updateIncidentReport,
} from "@/lib/runbook-workflow";

const STORAGE_KEY = "runbook-studio-state-v1";
const DEMO_USER_ID = "maya";
const demoDashboard = {
  organization: null,
  currentMembership: {
    id: DEMO_USER_ID,
    name: "Maya Chen",
    role: "owner",
    roleValue: "OWNER",
    initials: "MC",
  },
  services: demoServices,
  runbooks: demoRunbooks,
  incidents: demoIncidents,
  teamMembers: demoTeamMembers,
  teamInvitations: [],
};

const panels = [
  { id: "command", label: "Command", icon: Radio },
  { id: "runbooks", label: "Runbooks", icon: BookOpen },
  { id: "services", label: "Services", icon: Server },
  { id: "team", label: "Team", icon: UsersRound },
  { id: "reports", label: "Reports", icon: Gauge },
];

const stepStatuses = [
  { id: "pending", label: "Pending", icon: Circle },
  { id: "in_progress", label: "Active", icon: Play },
  { id: "blocked", label: "Blocked", icon: PauseCircle },
  { id: "done", label: "Done", icon: Check },
];

const roleOptions = [
  { value: "OWNER", label: "Owner" },
  { value: "INCIDENT_COMMANDER", label: "Incident commander" },
  { value: "RESPONDER", label: "Responder" },
  { value: "VIEWER", label: "Viewer" },
];

const inviteRoleOptions = roleOptions.filter((role) => role.value !== "OWNER");

export function RunbookStudio({ currentUser = null, dashboard = demoDashboard, loadError = "", mode = "demo" }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isMutating, setIsMutating] = useState(false);
  const isDatabaseMode = mode === "database";
  const isBusy = isPending || isMutating;
  const initialServices = dashboard.services ?? demoServices;
  const initialMembers = dashboard.teamMembers ?? demoTeamMembers;
  const initialInvitations = dashboard.teamInvitations ?? [];
  const currentMembership = dashboard.currentMembership ?? demoDashboard.currentMembership;
  const permissions = getPermissions(currentMembership?.roleValue);
  const actorId = currentUser?.id ?? DEMO_USER_ID;
  const workspaceName = dashboard.organization?.name ?? "Local demo";
  const [incidents, setIncidents] = useState(dashboard.incidents ?? demoIncidents);
  const [runbooksState, setRunbooksState] = useState(dashboard.runbooks ?? demoRunbooks);
  const [servicesState, setServicesState] = useState(initialServices);
  const [membersState, setMembersState] = useState(initialMembers);
  const [invitationsState, setInvitationsState] = useState(initialInvitations);
  const runbooksData = runbooksState;
  const servicesData = servicesState;
  const membersData = membersState;
  const [selectedIncidentId, setSelectedIncidentId] = useState(dashboard.incidents?.[0]?.id ?? demoIncidents[0]?.id ?? null);
  const [selectedRunbookId, setSelectedRunbookId] = useState((dashboard.runbooks ?? demoRunbooks)[0]?.id ?? null);
  const [runbookDraft, setRunbookDraft] = useState(() =>
    cloneRunbook((dashboard.runbooks ?? demoRunbooks)[0] ?? createBlankRunbook(initialServices)),
  );
  const [selectedServiceId, setSelectedServiceId] = useState(initialServices[0]?.id ?? null);
  const [serviceDraft, setServiceDraft] = useState(() => cloneService(initialServices[0] ?? createBlankService()));
  const [reportDraft, setReportDraft] = useState(() => createReportDraft((dashboard.incidents ?? demoIncidents)[0]));
  const [inviteDraft, setInviteDraft] = useState({ email: "", role: "RESPONDER" });
  const [activePanel, setActivePanel] = useState("command");
  const [noteDraft, setNoteDraft] = useState("");
  const [resolveError, setResolveError] = useState("");
  const [actionError, setActionError] = useState("");
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    const storedDashboard = isDatabaseMode ? null : loadStoredDashboard();
    const nextIncidents = isDatabaseMode ? dashboard.incidents ?? [] : storedDashboard?.incidents ?? dashboard.incidents ?? demoIncidents;
    const nextRunbooks = isDatabaseMode ? dashboard.runbooks ?? [] : storedDashboard?.runbooks ?? dashboard.runbooks ?? demoRunbooks;
    const nextServices = isDatabaseMode ? dashboard.services ?? [] : storedDashboard?.services ?? dashboard.services ?? demoServices;
    const nextMembers = isDatabaseMode ? dashboard.teamMembers ?? [] : storedDashboard?.teamMembers ?? dashboard.teamMembers ?? demoTeamMembers;
    const nextInvitations = isDatabaseMode ? dashboard.teamInvitations ?? [] : storedDashboard?.teamInvitations ?? dashboard.teamInvitations ?? [];
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) {
        return;
      }

      setIncidents(nextIncidents);
      setRunbooksState(nextRunbooks);
      setServicesState(nextServices);
      setMembersState(nextMembers);
      setInvitationsState(nextInvitations);
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
      setSelectedServiceId((currentId) => {
        if (currentId && nextServices.some((service) => service.id === currentId)) {
          return currentId;
        }

        return nextServices[0]?.id ?? null;
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
    const selectedService = servicesData.find((service) => service.id === selectedServiceId);
    const nextDraft = cloneService(selectedService ?? createBlankService());
    let cancelled = false;

    queueMicrotask(() => {
      if (!cancelled) {
        setServiceDraft(nextDraft);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [selectedServiceId, servicesData]);

  useEffect(() => {
    const selectedIncident = incidents.find((incident) => incident.id === selectedIncidentId) ?? incidents[0] ?? null;
    const nextDraft = createReportDraft(selectedIncident);
    let cancelled = false;

    queueMicrotask(() => {
      if (!cancelled) {
        setReportDraft(nextDraft);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [incidents, selectedIncidentId]);

  useEffect(() => {
    if (!storageReady || isDatabaseMode) {
      return;
    }

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        incidents,
        runbooks: runbooksData,
        services: servicesData,
        teamMembers: membersData,
        teamInvitations: invitationsState,
      }),
    );
  }, [incidents, invitationsState, isDatabaseMode, membersData, runbooksData, servicesData, storageReady]);

  const activeIncidents = useMemo(() => getActiveIncidents(incidents), [incidents]);
  const serviceHealth = useMemo(() => buildServiceHealth(servicesData, incidents), [incidents, servicesData]);
  const selectedIncident = incidents.find((incident) => incident.id === selectedIncidentId) ?? incidents[0] ?? null;
  const selectedService = selectedIncident ? findService(servicesData, selectedIncident.serviceId) : null;
  const selectedCatalogService = serviceHealth.find((service) => service.id === selectedServiceId) ?? serviceHealth[0] ?? null;
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

  function handleNewService() {
    setActionError("");
    setSelectedServiceId(null);
    setServiceDraft(createBlankService());
  }

  function handleSelectService(serviceId) {
    setActionError("");
    setSelectedServiceId(serviceId);
  }

  function handleServiceField(field, value) {
    setActionError("");
    setServiceDraft((current) => ({ ...current, [field]: value }));
  }

  function handleSaveService(event) {
    event.preventDefault();
    const parsed = saveServiceSchema.safeParse({
      ...serviceDraft,
      id: selectedServiceId,
      lastDeploy: serviceDraft.lastDeploy || null,
    });

    if (!parsed.success) {
      setActionError(parsed.error.issues[0]?.message ?? "Service is missing required fields.");
      return;
    }

    if (isDatabaseMode) {
      runServerAction(
        () =>
          saveServiceAction({
            ...parsed.data,
            id: selectedServiceId,
          }),
        {
          onSuccess: (result) => setSelectedServiceId(result.serviceId),
        },
      );
      return;
    }

    const savedService = {
      ...parsed.data,
      id: parsed.data.id ?? makeLocalServiceId(parsed.data.name, servicesData),
      lastDeploy: parsed.data.lastDeploy ? new Date(parsed.data.lastDeploy).toISOString() : null,
      openIncidents: 0,
    };
    setServicesState((current) => upsertService(current, savedService));
    setSelectedServiceId(savedService.id);
    setActionError("");
  }

  function handleDeleteService() {
    if (!selectedServiceId) {
      return;
    }

    const linkedRunbooks = runbooksData.some((runbook) => runbook.serviceId === selectedServiceId);
    const linkedIncidents = incidents.some((incident) => incident.serviceId === selectedServiceId);

    if (linkedRunbooks || linkedIncidents) {
      setActionError("Services with runbooks or incident history cannot be deleted.");
      return;
    }

    if (isDatabaseMode) {
      runServerAction(() => deleteServiceAction({ serviceId: selectedServiceId }), {
        onSuccess: () => setSelectedServiceId(null),
      });
      return;
    }

    const nextServices = servicesData.filter((service) => service.id !== selectedServiceId);
    setServicesState(nextServices);
    setSelectedServiceId(nextServices[0]?.id ?? null);
    setActionError("");
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

  function handleReportField(field, value) {
    setActionError("");
    setReportDraft((current) => ({ ...current, [field]: value }));
  }

  function handleSaveReport(event) {
    event.preventDefault();

    if (!selectedIncident) {
      return;
    }

    const parsed = incidentReportSchema.safeParse({
      ...reportDraft,
      incidentId: selectedIncident.id,
    });

    if (!parsed.success) {
      setActionError(parsed.error.issues[0]?.message ?? "Incident report is too long.");
      return;
    }

    if (isDatabaseMode) {
      runServerAction(() => saveIncidentReportAction(parsed.data));
      return;
    }

    updateIncident(selectedIncident.id, (incident) => updateIncidentReport(incident, parsed.data, actorId));
  }

  function handleInviteField(field, value) {
    setActionError("");
    setInviteDraft((current) => ({ ...current, [field]: value }));
  }

  function handleCreateInvite(event) {
    event.preventDefault();
    const parsed = createInvitationSchema.safeParse(inviteDraft);

    if (!parsed.success) {
      setActionError(parsed.error.issues[0]?.message ?? "Invite needs a valid email and role.");
      return;
    }

    if (membersData.some((member) => member.email?.toLowerCase() === parsed.data.email)) {
      setActionError("That email is already a workspace member.");
      return;
    }

    if (isDatabaseMode) {
      runServerAction(() => createInvitationAction(parsed.data), {
        onSuccess: () => setInviteDraft({ email: "", role: "RESPONDER" }),
      });
      return;
    }

    const invitation = {
      id: makeLocalInvitationId(parsed.data.email, invitationsState),
      email: parsed.data.email,
      role: roleLabel(parsed.data.role),
      roleValue: parsed.data.role,
      token: makeLocalInvitationToken(parsed.data.email),
      createdAt: new Date().toISOString(),
      expiresAt: addDaysIso(14),
    };

    setInvitationsState((current) => [invitation, ...current]);
    setInviteDraft({ email: "", role: "RESPONDER" });
    setActionError("");
  }

  function handleCancelInvite(invitationId) {
    if (isDatabaseMode) {
      runServerAction(() => cancelInvitationAction({ invitationId }));
      return;
    }

    setInvitationsState((current) => current.filter((invitation) => invitation.id !== invitationId));
    setActionError("");
  }

  function handleMemberRole(userId, role) {
    const parsed = updateMemberRoleSchema.safeParse({ userId, role });

    if (!parsed.success) {
      setActionError(parsed.error.issues[0]?.message ?? "Invalid member role.");
      return;
    }

    if (isDatabaseMode) {
      runServerAction(() => updateMemberRoleAction(parsed.data));
      return;
    }

    const ownerCount = membersData.filter((member) => member.roleValue === "OWNER").length;
    const targetMember = membersData.find((member) => member.id === userId);

    if (targetMember?.roleValue === "OWNER" && role !== "OWNER" && ownerCount <= 1) {
      setActionError("A workspace must keep at least one owner.");
      return;
    }

    setMembersState((current) => current.map((member) => (member.id === userId ? { ...member, role: roleLabel(role), roleValue: role } : member)));
    setActionError("");
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
            <span className="mode-chip">{roleLabel(currentMembership?.roleValue ?? "OWNER")}</span>
            {isBusy && <span className="mode-chip busy">Syncing</span>}
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
              disabled={isBusy || !runbooksData[0] || !permissions.canRunIncident}
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
              canRunIncident={permissions.canRunIncident}
              canResolveIncident={permissions.canResolveIncident}
              canEditIncidentReport={permissions.canEditIncidentReport}
              resolveError={resolveError}
              reportDraft={reportDraft}
              noteDraft={noteDraft}
              onReportField={handleReportField}
              onSaveReport={handleSaveReport}
              onNoteDraft={setNoteDraft}
              onAddNote={handleAddNote}
              onResolve={handleResolve}
              onStepStatus={handleStepStatus}
              onAssignee={handleAssignee}
            />

            <aside className="side-stack">
              <RunbookLauncher
                runbooks={runbooksData}
                services={servicesData}
                pending={isBusy}
                canRunIncident={permissions.canRunIncident}
                onLaunch={handleLaunchRunbook}
              />
              <ServiceHealth services={serviceHealth} />
            </aside>
          </section>
        )}

        {activePanel === "runbooks" && (
          <RunbookLibrary
            draft={runbookDraft}
            pending={isBusy}
            canManageCatalog={permissions.canManageCatalog}
            canRunIncident={permissions.canRunIncident}
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
        {activePanel === "services" && (
          <ServiceBoard
            draft={serviceDraft}
            pending={isBusy}
            canManageCatalog={permissions.canManageCatalog}
            selectedService={selectedCatalogService}
            selectedServiceId={selectedServiceId}
            services={serviceHealth}
            onDelete={handleDeleteService}
            onDraftField={handleServiceField}
            onNew={handleNewService}
            onSave={handleSaveService}
            onSelect={handleSelectService}
          />
        )}
        {activePanel === "team" && (
          <TeamBoard
            canManageTeam={permissions.canManageTeam}
            currentUserId={actorId}
            invitationDraft={inviteDraft}
            invitations={invitationsState}
            members={membersData}
            pending={isBusy}
            onCancelInvite={handleCancelInvite}
            onCreateInvite={handleCreateInvite}
            onInviteField={handleInviteField}
            onMemberRole={handleMemberRole}
          />
        )}
        {activePanel === "reports" && <Reports incidents={incidents} services={servicesData} />}
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
        {incidents.length === 0 && (
          <div className="empty-state">
            <AlertTriangle size={18} aria-hidden="true" />
            <span>No incidents yet.</span>
          </div>
        )}
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
  canRunIncident,
  canResolveIncident: canResolve,
  canEditIncidentReport,
  resolveError,
  reportDraft,
  noteDraft,
  onReportField,
  onSaveReport,
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
          disabled={pending || !readyToResolve || incident.status === "resolved" || !canResolve}
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
                  disabled={pending || !canRunIncident}
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
                        disabled={pending || !canRunIncident}
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
              disabled={pending || !canRunIncident}
            />
            <button type="submit" aria-label="Add note" disabled={pending || !noteDraft.trim() || !canRunIncident}>
              <Send size={17} aria-hidden="true" />
            </button>
          </form>

          <form className="report-form" onSubmit={onSaveReport}>
            <div className="report-form-heading">
              <p className="eyebrow">Post-incident</p>
              <button className="secondary-action compact" type="submit" disabled={pending || !canEditIncidentReport}>
                <Save size={16} aria-hidden="true" />
                <span>Save report</span>
              </button>
            </div>
            <label className="field-label">
              Summary
              <textarea
                value={reportDraft.summary}
                onChange={(event) => onReportField("summary", event.target.value)}
                rows={2}
                disabled={pending || !canEditIncidentReport}
              />
            </label>
            <label className="field-label">
              Impact
              <textarea
                value={reportDraft.impactSummary}
                onChange={(event) => onReportField("impactSummary", event.target.value)}
                rows={2}
                disabled={pending || !canEditIncidentReport}
              />
            </label>
            <label className="field-label">
              Root cause
              <textarea
                value={reportDraft.rootCause}
                onChange={(event) => onReportField("rootCause", event.target.value)}
                rows={2}
                disabled={pending || !canEditIncidentReport}
              />
            </label>
            <label className="field-label">
              Resolution
              <textarea
                value={reportDraft.resolutionSummary}
                onChange={(event) => onReportField("resolutionSummary", event.target.value)}
                rows={2}
                disabled={pending || !canEditIncidentReport}
              />
            </label>
            <label className="field-label">
              Follow-ups
              <textarea
                value={reportDraft.followUpActions}
                onChange={(event) => onReportField("followUpActions", event.target.value)}
                rows={2}
                disabled={pending || !canEditIncidentReport}
              />
            </label>
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

function RunbookLauncher({ runbooks, services, pending, canRunIncident, onLaunch }) {
  return (
    <section className="panel compact-panel" aria-labelledby="launcher-heading">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Runbooks</p>
          <h2 id="launcher-heading">Launch</h2>
        </div>
      </div>

      <div className="runbook-list">
        {runbooks.length === 0 && (
          <div className="empty-state">
            <BookOpen size={18} aria-hidden="true" />
            <span>No runbooks yet.</span>
          </div>
        )}
        {runbooks.slice(0, 3).map((runbook) => (
          <article className="runbook-row" key={runbook.id}>
            <div>
              <strong>{runbook.title}</strong>
              <span>{findService(services, runbook.serviceId)?.name} / {runbook.defaultSeverity}</span>
            </div>
            <button type="button" onClick={() => onLaunch(runbook)} aria-label={`Launch ${runbook.title}`} disabled={pending || !canRunIncident}>
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
        {serviceHealth.length === 0 && (
          <div className="empty-state">
            <Server size={18} aria-hidden="true" />
            <span>No services tracked.</span>
          </div>
        )}
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
  canManageCatalog,
  canRunIncident,
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
          <button className="icon-action" type="button" onClick={onNew} aria-label="New runbook" disabled={pending || !canManageCatalog}>
            <FilePlus2 size={17} aria-hidden="true" />
          </button>
        </div>

        {runbooks.length === 0 && (
          <div className="panel empty-state">
            <BookOpen size={18} aria-hidden="true" />
            <span>No runbooks yet.</span>
          </div>
        )}

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
            <button type="button" onClick={() => onLaunch(runbook)} aria-label={`Launch ${runbook.title}`} disabled={pending || !canRunIncident}>
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
            <button className="secondary-action compact" type="button" onClick={onDelete} disabled={pending || !selectedRunbookId || !canManageCatalog}>
              <Trash2 size={16} aria-hidden="true" />
              <span>Delete</span>
            </button>
            <button className="primary-action compact" type="submit" disabled={pending || !canManageCatalog}>
              <Save size={16} aria-hidden="true" />
              <span>Save</span>
            </button>
          </div>
        </div>

        <div className="editor-grid">
          <label className="field-label">
            Title
            <input value={draft.title} onChange={(event) => onDraftField("title", event.target.value)} disabled={pending || !canManageCatalog} />
          </label>
          <label className="field-label">
            Service
            <select value={draft.serviceId} onChange={(event) => onDraftField("serviceId", event.target.value)} disabled={pending || !canManageCatalog}>
              {services.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Severity
            <select value={draft.defaultSeverity} onChange={(event) => onDraftField("defaultSeverity", event.target.value)} disabled={pending || !canManageCatalog}>
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
              disabled={pending || !canManageCatalog}
            />
          </label>
          <label className="field-label editor-summary">
            Summary
            <textarea value={draft.summary} onChange={(event) => onDraftField("summary", event.target.value)} rows={3} disabled={pending || !canManageCatalog} />
          </label>
        </div>

        <div className="editor-section-heading">
          <div>
            <p className="eyebrow">Checklist</p>
            <h3>Steps</h3>
          </div>
          <button className="secondary-action compact" type="button" onClick={onAddStep} disabled={pending || !canManageCatalog}>
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
                  <button
                    type="button"
                    onClick={() => onMoveStep(index, -1)}
                    aria-label={`Move step ${index + 1} up`}
                    disabled={pending || index === 0 || !canManageCatalog}
                  >
                    <ArrowUp size={15} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onMoveStep(index, 1)}
                    aria-label={`Move step ${index + 1} down`}
                    disabled={pending || index === draft.steps.length - 1 || !canManageCatalog}
                  >
                    <ArrowDown size={15} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveStep(index)}
                    aria-label={`Remove step ${index + 1}`}
                    disabled={pending || draft.steps.length <= 1 || !canManageCatalog}
                  >
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="editor-step-grid">
                <label className="field-label">
                  Title
                  <input value={step.title} onChange={(event) => onStepField(index, "title", event.target.value)} disabled={pending || !canManageCatalog} />
                </label>
                <label className="field-label">
                  Role
                  <input value={step.role} onChange={(event) => onStepField(index, "role", event.target.value)} disabled={pending || !canManageCatalog} />
                </label>
                <label className="field-label">
                  Timebox
                  <input
                    min="1"
                    max="240"
                    type="number"
                    value={step.timeboxMinutes ?? ""}
                    onChange={(event) => onStepField(index, "timeboxMinutes", event.target.value)}
                    disabled={pending || !canManageCatalog}
                  />
                </label>
                <label className="field-label step-detail">
                  Detail
                  <textarea value={step.detail} onChange={(event) => onStepField(index, "detail", event.target.value)} rows={3} disabled={pending || !canManageCatalog} />
                </label>
                <label className="check-label">
                  <input
                    checked={step.required}
                    type="checkbox"
                    onChange={(event) => onStepField(index, "required", event.target.checked)}
                    disabled={pending || !canManageCatalog}
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

function ServiceBoard({
  draft,
  pending,
  canManageCatalog,
  selectedService,
  selectedServiceId,
  services: serviceHealth,
  onDelete,
  onDraftField,
  onNew,
  onSave,
  onSelect,
}) {
  const canDelete = selectedService && selectedService.openIncidents === 0;

  return (
    <section className="service-workbench" aria-label="Service catalog">
      <div className="panel table-panel" aria-labelledby="services-heading">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Catalog</p>
            <h2 id="services-heading">Services</h2>
          </div>
          <button className="icon-action" type="button" onClick={onNew} aria-label="New service" disabled={pending || !canManageCatalog}>
            <FilePlus2 size={17} aria-hidden="true" />
          </button>
        </div>

        <div className="service-table" role="table">
          <div className="table-row table-head" role="row">
            <span role="columnheader">Service</span>
            <span role="columnheader">Owner</span>
            <span role="columnheader">Tier</span>
            <span role="columnheader">SLO</span>
            <span role="columnheader">Status</span>
          </div>
          {serviceHealth.length === 0 && (
            <div className="empty-state">
              <Server size={18} aria-hidden="true" />
              <span>No services yet.</span>
            </div>
          )}
          {serviceHealth.map((service) => (
            <button
              className={selectedServiceId === service.id ? "table-row selectable-row selected" : "table-row selectable-row"}
              role="row"
              type="button"
              key={service.id}
              onClick={() => onSelect(service.id)}
            >
              <strong role="cell">{service.name}</strong>
              <span role="cell">{service.owner}</span>
              <span role="cell">{service.tier}</span>
              <span role="cell">{service.slo}</span>
              <span role="cell"><StatusBadge value={service.status} /></span>
            </button>
          ))}
        </div>
      </div>

      <form className="panel service-editor" onSubmit={onSave}>
        <div className="editor-heading">
          <div>
            <p className="eyebrow">Service</p>
            <h2>{selectedServiceId ? "Edit service" : "New service"}</h2>
          </div>
          <div className="editor-actions">
            <button
              className="secondary-action compact"
              type="button"
              onClick={onDelete}
              disabled={pending || !selectedServiceId || !canManageCatalog || !canDelete}
            >
              <Trash2 size={16} aria-hidden="true" />
              <span>Delete</span>
            </button>
            <button className="primary-action compact" type="submit" disabled={pending || !canManageCatalog}>
              <Save size={16} aria-hidden="true" />
              <span>Save</span>
            </button>
          </div>
        </div>

        <div className="editor-grid service-editor-grid">
          <label className="field-label">
            Name
            <input value={draft.name} onChange={(event) => onDraftField("name", event.target.value)} disabled={pending || !canManageCatalog} />
          </label>
          <label className="field-label">
            Owner
            <input value={draft.owner} onChange={(event) => onDraftField("owner", event.target.value)} disabled={pending || !canManageCatalog} />
          </label>
          <label className="field-label">
            Tier
            <select value={draft.tier} onChange={(event) => onDraftField("tier", event.target.value)} disabled={pending || !canManageCatalog}>
              {["Tier 1", "Tier 2", "Tier 3"].map((tier) => (
                <option key={tier} value={tier}>
                  {tier}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            Status
            <select value={draft.status} onChange={(event) => onDraftField("status", event.target.value)} disabled={pending || !canManageCatalog}>
              {["healthy", "degraded", "down"].map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status)}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            SLO
            <input value={draft.slo} onChange={(event) => onDraftField("slo", event.target.value)} disabled={pending || !canManageCatalog} />
          </label>
          <label className="field-label">
            Last deploy
            <input
              type="datetime-local"
              value={toDateTimeLocal(draft.lastDeploy)}
              onChange={(event) => onDraftField("lastDeploy", event.target.value)}
              disabled={pending || !canManageCatalog}
            />
          </label>
        </div>

        {selectedService && (
          <div className="service-editor-footer">
            <span>{selectedService.openIncidents} open incidents</span>
            <span>{selectedService.lastDeploy ? `Last deploy ${formatShortDate(selectedService.lastDeploy)}` : "No deploy recorded"}</span>
          </div>
        )}
      </form>
    </section>
  );
}

function TeamBoard({
  canManageTeam,
  currentUserId,
  invitationDraft,
  invitations,
  members,
  pending,
  onCancelInvite,
  onCreateInvite,
  onInviteField,
  onMemberRole,
}) {
  return (
    <section className="team-workbench" aria-label="Team management">
      <div className="panel team-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Members</p>
            <h2>Team</h2>
          </div>
        </div>

        <div className="team-list">
          {members.length === 0 && (
            <div className="empty-state">
              <UsersRound size={18} aria-hidden="true" />
              <span>No team members yet.</span>
            </div>
          )}
          {members.map((member) => (
            <article className="team-row" key={member.id}>
              <span className="avatar">{member.initials}</span>
              <div>
                <strong>{member.name}</strong>
                <span>{member.email ?? member.role}</span>
              </div>
              <select
                value={member.roleValue ?? roleValueFromLabel(member.role)}
                onChange={(event) => onMemberRole(member.id, event.target.value)}
                aria-label={`Role for ${member.name}`}
                disabled={pending || !canManageTeam || member.id === currentUserId}
              >
                {roleOptions.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </article>
          ))}
        </div>
      </div>

      <div className="panel team-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Invitations</p>
            <h2>Invite</h2>
          </div>
        </div>

        <form className="invite-form" onSubmit={onCreateInvite}>
          <label className="field-label">
            Email
            <input
              type="email"
              value={invitationDraft.email}
              onChange={(event) => onInviteField("email", event.target.value)}
              disabled={pending || !canManageTeam}
            />
          </label>
          <label className="field-label">
            Role
            <select value={invitationDraft.role} onChange={(event) => onInviteField("role", event.target.value)} disabled={pending || !canManageTeam}>
              {inviteRoleOptions.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </label>
          <button className="primary-action compact" type="submit" disabled={pending || !canManageTeam}>
            <MailPlus size={16} aria-hidden="true" />
            <span>Invite</span>
          </button>
        </form>

        <div className="invite-list">
          {invitations.length === 0 && (
            <div className="empty-state">
              <MailPlus size={18} aria-hidden="true" />
              <span>No pending invitations.</span>
            </div>
          )}
          {invitations.map((invitation) => (
            <article className="invite-row" key={invitation.id}>
              <div>
                <strong>{invitation.email}</strong>
                <span>{roleLabel(invitation.roleValue)} / expires {formatShortDate(invitation.expiresAt)}</span>
              </div>
              <div className="invite-actions">
                <button
                  type="button"
                  onClick={() => copyInviteLink(invitation.token)}
                  aria-label={`Copy invite link for ${invitation.email}`}
                  disabled={pending}
                >
                  <Clipboard size={15} aria-hidden="true" />
                </button>
                <button type="button" onClick={() => onCancelInvite(invitation.id)} aria-label={`Cancel invite for ${invitation.email}`} disabled={pending || !canManageTeam}>
                  <X size={15} aria-hidden="true" />
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Reports({ incidents, services }) {
  const resolved = incidents.filter((incident) => incident.status === "resolved");
  const active = getActiveIncidents(incidents);
  const noisyServices = services
    .map((service) => ({
      ...service,
      incidentCount: incidents.filter((incident) => incident.serviceId === service.id).length,
    }))
    .sort((a, b) => b.incidentCount - a.incidentCount)
    .slice(0, 3);

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
        {resolved.length === 0 && (
          <div className="empty-state">
            <CheckCircle2 size={18} aria-hidden="true" />
            <span>No resolved incidents yet.</span>
          </div>
        )}
        {resolved.map((incident) => (
          <div className="resolved-row" key={incident.id}>
            <strong>{incident.title}</strong>
            <span>{incident.summary || "Summary pending"}</span>
            <small>{incident.rootCause || "Root cause pending"}</small>
          </div>
        ))}
      </article>
      <article className="panel report-panel wide">
        <p className="eyebrow">Noisy services</p>
        {noisyServices.map((service) => (
          <div className="resolved-row" key={service.id}>
            <strong>{service.name}</strong>
            <span>{service.incidentCount} incidents / {service.slo} SLO</span>
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

function getPermissions(roleValue = "VIEWER") {
  return {
    canRunIncident: ["OWNER", "INCIDENT_COMMANDER", "RESPONDER"].includes(roleValue),
    canResolveIncident: ["OWNER", "INCIDENT_COMMANDER"].includes(roleValue),
    canEditIncidentReport: ["OWNER", "INCIDENT_COMMANDER"].includes(roleValue),
    canManageCatalog: roleValue === "OWNER",
    canManageTeam: roleValue === "OWNER",
  };
}

function cloneService(service) {
  return {
    id: service.id ?? null,
    name: service.name ?? "",
    owner: service.owner ?? "",
    tier: service.tier ?? "Tier 2",
    status: service.status ?? "healthy",
    slo: service.slo ?? "99.90%",
    lastDeploy: service.lastDeploy ?? null,
  };
}

function cloneRunbook(runbook) {
  return {
    ...runbook,
    steps: runbook.steps.map((step) => ({ ...step })),
  };
}

function createBlankService() {
  return {
    id: null,
    name: "New service",
    owner: "Platform",
    tier: "Tier 2",
    status: "healthy",
    slo: "99.90%",
    lastDeploy: null,
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

function createReportDraft(incident) {
  return {
    summary: incident?.summary ?? "",
    impactSummary: incident?.impactSummary ?? "",
    rootCause: incident?.rootCause ?? "",
    resolutionSummary: incident?.resolutionSummary ?? "",
    followUpActions: incident?.followUpActions ?? "",
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

function makeLocalServiceId(name, services) {
  const baseId = slugify(name) || "custom-service";
  let id = baseId;
  let suffix = 2;

  while (services.some((service) => service.id === id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }

  return id;
}

function makeLocalInvitationId(email, invitations) {
  const baseId = `invite-${slugify(email) || "teammate"}`;
  let id = baseId;
  let suffix = 2;

  while (invitations.some((invitation) => invitation.id === id)) {
    id = `${baseId}-${suffix}`;
    suffix += 1;
  }

  return id;
}

function makeLocalInvitationToken(email) {
  return `demo-${slugify(email) || "invite"}`;
}

function upsertRunbook(runbooks, runbook) {
  if (runbooks.some((current) => current.id === runbook.id)) {
    return runbooks.map((current) => (current.id === runbook.id ? runbook : current));
  }

  return [runbook, ...runbooks];
}

function upsertService(services, service) {
  if (services.some((current) => current.id === service.id)) {
    return services.map((current) => (current.id === service.id ? service : current));
  }

  return [service, ...services];
}

function addDaysIso(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function roleLabel(value) {
  return roleOptions.find((role) => role.value === value)?.label ?? value?.toLowerCase().replaceAll("_", " ") ?? "Viewer";
}

function roleValueFromLabel(label) {
  return roleOptions.find((role) => role.label.toLowerCase() === label?.toLowerCase())?.value ?? "VIEWER";
}

function statusLabel(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function toDateTimeLocal(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 16);
}

function copyInviteLink(token) {
  if (typeof window === "undefined" || !navigator.clipboard) {
    return;
  }

  navigator.clipboard.writeText(`${window.location.origin}/sign-in?invite=${token}`).catch((error) => {
    console.error(error);
  });
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
      services: Array.isArray(parsed.services) ? parsed.services : null,
      teamMembers: Array.isArray(parsed.teamMembers) ? parsed.teamMembers : null,
      teamInvitations: Array.isArray(parsed.teamInvitations) ? parsed.teamInvitations : null,
    };
  } catch {
    return null;
  }
}
