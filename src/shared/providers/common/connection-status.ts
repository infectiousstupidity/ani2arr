export type ProviderConnectionStatus = 'connected' | 'configured' | 'connecting' | 'not-configured';

export const getProviderConnectionStatusLabel = (
  status: ProviderConnectionStatus,
  options?: { short?: boolean },
): string => {
  const short = options?.short ?? false;

  switch (status) {
    case 'connected':
      return 'Connected';
    case 'configured':
      return 'Configured';
    case 'connecting':
      return short ? 'Checking' : 'Checking connection';
    default:
      return short ? 'Not set' : 'Not configured';
  }
};

export const getProviderConnectionStatusAppearance = (status: ProviderConnectionStatus) => {
  switch (status) {
    case 'connected':
      return {
        badgeClassName: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40',
        dotClassName: 'bg-emerald-400',
        textClassName: 'text-emerald-300',
      };
    case 'configured':
      return {
        badgeClassName: 'bg-sky-500/10 text-sky-300 border-sky-500/40',
        dotClassName: 'bg-sky-400',
        textClassName: 'text-sky-300',
      };
    case 'connecting':
      return {
        badgeClassName: 'bg-amber-500/10 text-amber-300 border-amber-500/40',
        dotClassName: 'bg-amber-400',
        textClassName: 'text-amber-300',
      };
    default:
      return {
        badgeClassName: 'bg-slate-700/50 text-text-secondary border-border-primary',
        dotClassName: 'bg-slate-400',
        textClassName: 'text-text-secondary',
      };
  }
};
