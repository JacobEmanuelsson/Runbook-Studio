import { initialIncidents, runbooks, services, teamMembers } from "@/lib/sample-data";

export const DEMO_USER_ID = "maya";
export const demoIncidents = initialIncidents;
export const demoRunbooks = runbooks;
export const demoServices = services;
export const demoTeamMembers = teamMembers;

export const demoDashboard = {
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
