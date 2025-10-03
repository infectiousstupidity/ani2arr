export const getReactProps = <TProps extends Record<string, unknown>>(
  element: Element | null | undefined,
): TProps | null => {
  if (!element) return null;
  const keys = Object.keys(element as unknown as Record<string, unknown>);
  const propKey = keys.find(key => key.startsWith('__reactProps$'));
  if (!propKey) return null;
  const props = (element as unknown as Record<string, unknown>)[propKey];
  if (!props || typeof props !== 'object') return null;
  return props as TProps;
};

export const getReactHandler = <THandler extends (...args: unknown[]) => unknown>(
  element: Element | null | undefined,
  handlerName: string,
): THandler | null => {
  const props = getReactProps<Record<string, unknown>>(element);
  if (!props) return null;
  const handler = props[handlerName];
  return typeof handler === 'function' ? (handler as THandler) : null;
};
