declare module 'config/tokens/iptv-tavern-palette.json' {
  const value: {
    version: number;
    iptvTavern: {
      light: Record<string, Record<string, string>>;
      dark: Record<string, Record<string, string>>;
    };
  };
  export default value;
}

declare module 'config/tokens/iptv-semantic-colors.json' {
  const value: {
    version: number;
    light: Record<string, Record<string, string>>;
    dark: Record<string, Record<string, string>>;
  };
  export default value;
}
