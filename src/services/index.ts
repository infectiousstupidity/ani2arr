// src/services/index.ts

/**
 * @file This is the main "barrel" file for the services module.
 * It defines the public API of the background script using `@webext-core/proxy-service`.
 * By creating a single, unified API object, it provides a clean and type-safe way
 * for other parts of the extension to interact with the background logic.
 *
 * As an `index.ts` file, it allows consumers to import directly from the '@/services' path.
 */
import { defineProxyService } from '@webext-core/proxy-service';
import type { ICache } from './cache.service';
import { SonarrApiService } from '@/api/sonarr.api';
import { AnilistApiService } from '@/api/anilist.api';
import { MappingService } from './mapping.service';
import { LibraryService } from './library.service';

/**
 * The shape of our unified background API.
 * This type will be inferred by the proxy service, providing end-to-end type safety.
 */
interface KitsunarrApi {
  sonarr: SonarrApiService;
  anilist: AnilistApiService;
  mapping: MappingService;
  library: LibraryService;
}

/**
 * Defines the proxy service for the entire Kitsunarr backend.
 *
 * The `defineProxyService` function returns a tuple containing:
 * 1. `registerKitsunarrApi`: A function to be called once in the background script to
 *    instantiate and register the API. It takes the dependencies needed to construct the services.
 * 2. `getKitsunarrApi`: A function that can be called from any part of the extension
 *    to get a proxied, type-safe instance of the API.
 */
export const [registerKitsunarrApi, getKitsunarrApi] = defineProxyService<KitsunarrApi, [ICache]>(
  'KitsunarrApi',

  /**
   * This is the factory function that runs in the background script when `registerKitsunarrApi` is called.
   * It receives the dependencies passed to the register function (in this case, an `ICache` instance),
   * creates all the necessary service instances, wires them together, and returns the unified API object.
   * @param cache The application's main cache service instance, conforming to the ICache interface.
   * @returns The fully constructed KitsunarrApi object.
   */
  (cache: ICache) => {
    // 1. Instantiate all API clients and services.
    const sonarrApiService = new SonarrApiService();
    const anilistApiService = new AnilistApiService(cache);
    const mappingService = new MappingService(sonarrApiService, anilistApiService, cache);
    const libraryService = new LibraryService(sonarrApiService, mappingService, cache);

    // Bind all public methods of all services to preserve 'this' context.

    // SonarrApiService
    sonarrApiService.getAllSeries = sonarrApiService.getAllSeries.bind(sonarrApiService);
    sonarrApiService.getSeriesByTvdbId = sonarrApiService.getSeriesByTvdbId.bind(sonarrApiService);
    sonarrApiService.lookupSeriesByTerm = sonarrApiService.lookupSeriesByTerm.bind(sonarrApiService);
    sonarrApiService.addSeries = sonarrApiService.addSeries.bind(sonarrApiService);
    sonarrApiService.getRootFolders = sonarrApiService.getRootFolders.bind(sonarrApiService);
    sonarrApiService.getQualityProfiles = sonarrApiService.getQualityProfiles.bind(sonarrApiService);
    sonarrApiService.getTags = sonarrApiService.getTags.bind(sonarrApiService);
    sonarrApiService.testConnection = sonarrApiService.testConnection.bind(sonarrApiService);

    // AnilistApiService
    anilistApiService.findTvdbId = anilistApiService.findTvdbId.bind(anilistApiService);

    // MappingService
    mappingService.resolveTvdbId = mappingService.resolveTvdbId.bind(mappingService);
    mappingService.refreshStaticMapping = mappingService.refreshStaticMapping.bind(mappingService);

    // LibraryService
    libraryService.getLeanSeriesList = libraryService.getLeanSeriesList.bind(libraryService);
    libraryService.refreshCache = libraryService.refreshCache.bind(libraryService);
    libraryService.addSeriesToCache = libraryService.addSeriesToCache.bind(libraryService);
    libraryService.getSeriesStatus = libraryService.getSeriesStatus.bind(libraryService);

    // 2. Return the unified API object. The proxy service will expose this object.
    return {
      sonarr: sonarrApiService,
      anilist: anilistApiService,
      mapping: mappingService,
      library: libraryService,
    };
  },
);