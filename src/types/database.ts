// RadaStudentów24 — Database types
// Generated from schema, manually maintained until we set up Supabase CLI codegen

export type Role = 'admin' | 'chair' | 'member' | 'auditor' | 'secretary' | 'election_committee';
export type SessionType = 'regular' | 'extraordinary';
export type SessionMode = 'in_person' | 'remote' | 'hybrid';
export type SessionStatus = 'draft' | 'scheduled' | 'in_progress' | 'closed' | 'protocol_pending' | 'archived';
export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused' | 'left_early';
export type AgendaItemType = 'procedural' | 'discussion' | 'resolution' | 'election' | 'information';
export type AgendaItemStatus = 'pending' | 'in_progress' | 'completed' | 'postponed';
export type VoteType = 'open' | 'secret';
export type VoteThreshold = 'simple_majority' | 'absolute_majority' | 'two_thirds';
export type VoteStatus = 'pending' | 'open' | 'closed' | 'cancelled';
export type VoteResult = 'passed' | 'rejected' | 'no_quorum';
export type BallotChoice = 'for' | 'against' | 'abstain';
export type ResolutionStatus = 'draft' | 'adopted' | 'published' | 'revoked';
export type ProtocolStatus = 'draft' | 'review' | 'approved' | 'published';

export type OrgModule = 'sessions' | 'resolutions' | 'audit';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  accent_color: string | null;
  enabled_modules: OrgModule[];
  created_at: string;
}

export interface Organ {
  id: string;
  org_id: string;
  name: string;
  short_name: string;
  total_seats: number;
  quorum_type: 'majority' | 'two_thirds' | 'custom';
  quorum_value: number | null;
  resolution_prefix: string;
  resolution_pattern: string;
  created_at: string;
}

export interface Term {
  id: string;
  organ_id: string;
  label: string;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  resolution_counter: number;
  created_at: string;
}

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  avatar_url: string | null;
  created_at: string;
}

export interface Mandate {
  id: string;
  term_id: string;
  profile_id: string;
  role: Role;
  label: string | null;
  is_active: boolean;
  granted_at: string;
  revoked_at: string | null;
  // Joined
  profile?: Profile;
}

export interface Invitation {
  id: string;
  term_id: string;
  email: string;
  role: Role;
  label: string | null;
  invited_by: string | null;
  created_at: string;
  accepted_at: string | null;
}

export interface Session {
  id: string;
  organ_id: string;
  term_id: string;
  title: string;
  session_type: SessionType;
  mode: SessionMode;
  scheduled_at: string;
  location: string | null;
  opened_at: string | null;
  closed_at: string | null;
  status: SessionStatus;
  chaired_by: string | null;
  protocol_by: string | null;
  created_by: string | null;
  created_at: string;
  // Joined
  organ?: Organ;
  term?: Term;
  chair_profile?: Profile;
}

export interface Attendance {
  id: string;
  session_id: string;
  mandate_id: string;
  status: AttendanceStatus;
  checked_in_at: string | null;
  checked_out_at: string | null;
  // Joined
  mandate?: Mandate & { profile?: Profile };
}

export interface AgendaItem {
  id: string;
  session_id: string;
  position: number;
  title: string;
  item_type: AgendaItemType;
  description: string | null;
  status: AgendaItemStatus;
  discussion_notes: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  // Joined
  votes?: Vote[];
  attachments?: AgendaAttachment[];
}

export interface AgendaAttachment {
  id: string;
  agenda_item_id: string;
  file_name: string;
  file_url: string;
  file_type: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface Vote {
  id: string;
  agenda_item_id: string | null;
  session_id: string;
  title: string;
  vote_type: VoteType;
  threshold: VoteThreshold;
  status: VoteStatus;
  opened_at: string | null;
  closed_at: string | null;
  votes_for: number;
  votes_against: number;
  votes_abstain: number;
  total_eligible: number;
  result: VoteResult | null;
  created_at: string;
  // Joined
  ballots?: Ballot[];
}

export interface Ballot {
  id: string;
  vote_id: string;
  mandate_id: string | null;
  choice: BallotChoice;
  cast_at: string;
  // Joined
  mandate?: Mandate & { profile?: Profile };
}

export interface Resolution {
  id: string;
  vote_id: string | null;
  session_id: string;
  term_id: string;
  number: number;
  signature: string;
  title: string;
  body: string;
  legal_basis: string | null;
  status: ResolutionStatus;
  signed_by: string | null;
  signed_at: string | null;
  pdf_url: string | null;
  created_at: string;
}

export interface Protocol {
  id: string;
  session_id: string;
  status: ProtocolStatus;
  generated_at: string | null;
  body: string | null;
  signed_by: string | null;
  signed_at: string | null;
  pdf_url: string | null;
  approved_at: string | null;
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  org_id: string;
  actor_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
  // Joined
  actor?: Profile;
}

// Quorum calculation result
export interface QuorumInfo {
  total_seats: number;
  present: number;
  required: number;
  has_quorum: boolean;
}
