/** The hidden menu never gates rooms. These switches do: a card team game keeps the engine on even while playground rooms are off. */
export const playgroundLive = () => process.env.PLAYGROUND_DISABLED !== 'true' && process.env.PLAYGROUND_LIVE_DISABLED !== 'true';
export const cardTeamEnabled = () => process.env.CARDS_TEAM_DISABLED !== 'true';
export const roomEngineEnabled = () => playgroundLive() || cardTeamEnabled();
