export type {
  User,
  Skill,
  UserSkill,
  Organisation,
  UserOrganisation,
  ProjectType,
  Blueprint,
  BlueprintStep,
  Project,
  ProjectStep,
  StepSkill,
  Contribution,
} from '@/app/generated/prisma'

export type {
  UserRole,
  OrgType,
  OrgRole,
  Proficiency,
  ProjectStatus,
  StepStatus,
  ContributionStatus,
  ContributionRole,
} from '@/app/generated/prisma'

export type ServerActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }
