import { defineProxyService } from '@webext-core/proxy-service';
import { CacheService } from './cache.service';
import { SonarrApiService } from '@/api/sonarr.api';
import { AnilistApiService } from '@/api/anilist.api';
import { MappingService } from './mapping.service';
import { LibraryService } from './library.service';

interface KitsunarrApi {
  sonarr: SonarrApiService;
  anilist: AnilistApiService;
  mapping: MappingService;
  library: LibraryService;
}

function bindAll<T extends object>(instance: T): T {
  const proto = Object.getPrototypeOf(instance) as Record<string, unknown> | null;
  if (!proto) return instance;

  const target = instance as Record<string, unknown>;

  for (const key of Object.getOwnPropertyNames(proto)) {
    if (key === 'constructor') continue;
    const value = proto[key];
    if (typeof value === 'function') {
      target[key] = value.bind(instance);
    }
  }

  return instance;
}

export const [registerKitsunarrApi, getKitsunarrApi] =
  defineProxyService<KitsunarrApi, []>('KitsunarrApi', () => {
    const cacheService = new CacheService();

    const sonarrApiService = bindAll(new SonarrApiService());
    const anilistApiService = bindAll(new AnilistApiService());
    const mappingService   = bindAll(new MappingService(sonarrApiService, anilistApiService, cacheService));
    const libraryService   = bindAll(new LibraryService(sonarrApiService, mappingService, cacheService));

    return {
      sonarr: sonarrApiService,
      anilist: anilistApiService,
      mapping: mappingService,
      library: libraryService,
    };
  });
