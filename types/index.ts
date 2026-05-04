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
} from '@prisma/client'

export type {
  UserRole,
  OrgType,
  OrgRole,
  Proficiency,
  ProjectStatus,
  StepStatus,
  ContributionStatus,
  ContributionRole,
} from '@prisma/client'

export type ServerActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }
