/** AniList GraphQL documents used by the transport layer. */
// src/anilist/transport/queries.ts

export const FIND_MEDIA_BATCH_QUERY = `
  query FindMediaBatch($ids: [Int!]) {
    Page(perPage: 50) {
      media(id_in: $ids, type: ANIME) {
        id
        format
        title { romaji english native }
        startDate { year }
        synonyms
        description(asHtml: false)
        episodes
        duration
        nextAiringEpisode {
          episode
          airingAt
        }
        relations {
          edges {
            relationType
            node { id }
          }
        }
        bannerImage
        coverImage {
          extraLarge
          large
          medium
          color
        }
        status
        season
        seasonYear
        genres
        studios(isMain: true) {
          nodes {
            name
          }
        }
      }
    }
  }
`;
