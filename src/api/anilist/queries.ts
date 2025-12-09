export const FIND_MEDIA_QUERY = `
  query FindMedia($id: Int) {
    Media(id: $id) {
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
          node {
            id
          }
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
`;

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

export const SEARCH_MEDIA_QUERY = `
  query SearchAnime($search: String!, $perPage: Int!) {
    Page(perPage: $perPage) {
      media(search: $search, type: ANIME) {
        id
        title { english romaji native }
        coverImage { large medium }
        format
        status
      }
    }
  }
`;
