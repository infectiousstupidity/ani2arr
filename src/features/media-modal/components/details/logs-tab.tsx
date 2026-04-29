/** Renders the modal mapping logs tab from the shared inspection payload. */
// src/features/media-modal/components/details/logs-tab.tsx

import { buildAniListAnimeUrl } from '@/anilist/anilist-links';
import Pill from '@/shared/ui/primitives/pill';
import type { MappingInspectionPayload } from '@/mapping/queries/mapping-details';
import type { Provider } from '@/providers';
import { getProviderIdLabel } from '@/providers/provider-labels';
import {
  formatToken,
  getSuggestedCandidateGroups,
} from '../../helpers';

type MappingInspectionLogsProps = {
  inspection: MappingInspectionPayload;
  provider: Provider;
};

function Section(props: { title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <section className="space-y-2 border-t border-border-primary/60 pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-[11px] font-semibold leading-none uppercase tracking-[0.16em] text-text-secondary">
        {props.title}
      </h3>
      {props.children}
    </section>
  );
}

function CodeBlock(props: { lines: Array<string | null | undefined> }): React.JSX.Element {
  const content = props.lines.filter(Boolean).join('\n');

  return (
    <pre className="overflow-x-auto rounded-lg bg-bg-primary/25 px-3 py-3 font-mono text-[11px] leading-5 whitespace-pre-wrap text-text-secondary">
      {content}
    </pre>
  );
}

export function MappingInspectionLogs(props: MappingInspectionLogsProps): React.JSX.Element {
  const { inspection, provider } = props;
  const providerIdLabel = getProviderIdLabel(provider);
  const hasReview = inspection.review.needsReview;
  const candidateGroups = getSuggestedCandidateGroups(inspection.suggestedCandidates);
  const hasSuggestedCandidates = candidateGroups.length > 0;
  const currentContextLines = [
    `aniListId: ${inspection.effectiveMapping.anilistId}`,
    `provider: ${provider}`,
    `providerMappingState: ${formatToken(inspection.effectiveMapping.providerMappingState)}`,
    `mappingRowStatus: ${formatToken(inspection.effectiveMapping.mappingRowStatus)}`,
    inspection.effectiveMapping.isInLibrary === null
      ? 'isInLibrary: unknown'
      : `isInLibrary: ${inspection.effectiveMapping.isInLibrary}`,
    inspection.effectiveMapping.providerId == null
      ? 'providerId: none'
      : `providerId: ${providerIdLabel} ${inspection.effectiveMapping.providerId}`,
    inspection.effectiveMapping.mappingEntryKind
      ? `mappingEntryKind: ${formatToken(inspection.effectiveMapping.mappingEntryKind)}`
      : null,
    inspection.effectiveMapping.mappingSource
      ? `mappingSource: ${formatToken(inspection.effectiveMapping.mappingSource)}`
      : null,
    inspection.effectiveMapping.mappingReason
      ? `mappingReason: ${formatToken(inspection.effectiveMapping.mappingReason)}`
      : null,
    inspection.effectiveMapping.resolverOutcome
      ? `resolverOutcome: ${formatToken(inspection.effectiveMapping.resolverOutcome)}`
      : null,
    inspection.effectiveMapping.mappingUnknownReason
      ? `mappingUnknownReason: ${formatToken(inspection.effectiveMapping.mappingUnknownReason)}`
      : null,
    inspection.effectiveMapping.libraryUnknownReason
      ? `libraryUnknownReason: ${formatToken(inspection.effectiveMapping.libraryUnknownReason)}`
      : null,
    inspection.effectiveMapping.suppressionKind
      ? `suppression: ${formatToken(inspection.effectiveMapping.suppressionKind)}`
      : null,
  ];

  return (
    <div className="space-y-4">
      <Section title="Current context">
        <CodeBlock lines={currentContextLines} />
      </Section>

      <Section title="Why this mapping exists">
        <div className="space-y-2">
          {inspection.whyThisMapping.map((item, index) => (
            <CodeBlock
              key={`${item.kind}-${index}`}
              lines={[
                `kind: ${formatToken(item.kind)}`,
                item.source ? `source: ${formatToken(item.source)}` : null,
                item.reason ? `reason: ${formatToken(item.reason)}` : null,
                item.resolverOutcome ? `resolverOutcome: ${formatToken(item.resolverOutcome)}` : null,
                item.reviewReason ? `reviewReason: ${formatToken(item.reviewReason)}` : null,
                item.suppressedProviderId ? `suppressedProviderId: ${item.suppressedProviderId}` : null,
                item.immediateSourceAniListId ? `immediateSourceAniListId: ${item.immediateSourceAniListId}` : null,
                item.chainAnchorAniListId ? `chainAnchorAniListId: ${item.chainAnchorAniListId}` : null,
                `summary: ${item.summary}`,
                ...(item.details ?? []).map((detail) => `detail: ${detail}`),
              ]}
            />
          ))}
        </div>
      </Section>

      <Section title="Linked AniList entries">
        {inspection.linkedAniListEntries.length > 0 ? (
          <div className="space-y-2">
            {inspection.linkedAniListEntries.map((entry) => (
              <a
                key={entry.anilistId}
                href={buildAniListAnimeUrl(entry.anilistId)}
                target="_blank"
                rel="noreferrer"
                className="block transition-opacity hover:opacity-100"
              >
                <CodeBlock
                  lines={[
                    `aniListId: ${entry.anilistId}`,
                    `title: ${entry.title ?? `AniList #${entry.anilistId}`}`,
                    `format: ${entry.format ? formatToken(entry.format) : 'Unknown format'}`,
                    entry.year ? `year: ${entry.year}` : null,
                    entry.relation ? `relation: ${entry.relation}` : null,
                  ]}
                />
              </a>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-secondary">
            No linked AniList entries are currently attached to this provider ID.
          </p>
        )}
      </Section>

      <Section title="Review state">
        {hasReview ? (
          <div className="space-y-2">
            <CodeBlock
              lines={[
                'needsReview: true',
                inspection.review.summary ? `count: ${inspection.review.summary.count}` : null,
                ...(inspection.review.summary?.reasons ?? []).map((reason) => `reason: ${formatToken(reason)}`),
              ]}
            />
            {inspection.review.items?.map((item, index) => (
              <CodeBlock
                key={`${item.reason}-${index}`}
                lines={[
                  `reason: ${formatToken(item.reason)}`,
                  `summary: ${item.summary}`,
                  item.current.providerId == null ? null : `currentProviderId: ${item.current.providerId}`,
                  item.proposed?.providerId == null ? null : `proposedProviderId: ${item.proposed.providerId}`,
                ]}
              />
            ))}
          </div>
        ) : (
          <CodeBlock lines={['needsReview: false']} />
        )}
      </Section>

      <Section title="Suggested candidates">
        {inspection.suggestedCandidates.searchTerms?.length ? (
          <CodeBlock lines={[`searchTerms: ${inspection.suggestedCandidates.searchTerms.join(', ')}`]} />
        ) : null}
        {hasSuggestedCandidates ? (
          <div className="space-y-3">
            {candidateGroups.map((group) => (
              <div key={group.key} className="space-y-2">
                {group.label ? (
                  <div className="flex items-center gap-2">
                    <Pill small tone={group.tone}>
                      {group.label}
                    </Pill>
                    <span className="text-xs text-text-secondary">
                      {`${group.items.length} candidate${group.items.length === 1 ? '' : 's'}`}
                    </span>
                  </div>
                ) : null}
                <div className="space-y-2">
                  {group.items.map((candidate) => (
                    <CodeBlock
                      key={`${group.key}-${candidate.providerId}`}
                      lines={[
                        `title: ${candidate.title ?? `${providerIdLabel} ${candidate.providerId}`}`,
                        `providerId: ${providerIdLabel} ${candidate.providerId}`,
                        `status: ${formatToken(candidate.status)}`,
                        `source: ${formatToken(candidate.source)}`,
                        `reason: ${formatToken(candidate.reason)}`,
                        `summary: ${candidate.summary}`,
                      ]}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-secondary">
            No recent candidate trace is available yet. Use manual search if you need to change this mapping.
          </p>
        )}
      </Section>
    </div>
  );
}
