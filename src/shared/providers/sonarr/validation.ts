export {
  buildArrPermissionPattern as buildSonarrPermissionPattern,
  hasArrPermission as hasSonarrPermission,
  requestArrPermission as requestSonarrPermission,
  validateArrApiKey as validateApiKey,
  validateArrUrl as validateUrl,
} from '@/shared/providers/common/validation';

export type { Err, Ok } from '@/shared/providers/common/validation';
