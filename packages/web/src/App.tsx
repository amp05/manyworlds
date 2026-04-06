import { useEffect } from 'react';
import { useGameStore } from './state/game.js';
import { Header, Span, Option, Sep, C } from './components/Terminal.js';
import { InterviewScreen } from './screens/InterviewScreen.js';
import { BlessingScreen } from './screens/BlessingScreen.js';
import { MapScreen } from './screens/MapScreen.js';
import { CombatScreen } from './screens/CombatScreen.js';
import { EventScreen, ShopScreen, RestScreen, LevelUpScreen } from './screens/NodeScreens.js';
import { VictoryScreen, DefeatScreen, BossIntroScreen, EncounterIntroScreen } from './screens/EndScreens.js';

export function App() {
  const { phase, content, error, loadContent } = useGameStore();

  useEffect(() => { loadContent(); }, []);

  if (error) {
    return (
      <div className="game-container">
        <div className="game-ui">
          <pre className="term-block">
            <Span color={C.hpLow}>{error}</Span>
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="game-container">
      <div className="game-ui">
        {phase === 'loading' && <pre className="term-block"><Span color={C.dim}>Loading today's world...</Span></pre>}
        {phase === 'title' && content && <TitleScreen />}
        {phase === 'interview' && <InterviewScreen />}
        {phase === 'blessing_select' && <BlessingScreen />}
        {phase === 'map' && <MapScreen />}
        {phase === 'encounter_intro' && <EncounterIntroScreen />}
        {phase === 'combat' && <CombatScreen />}
        {phase === 'boss_intro' && <BossIntroScreen />}
        {phase === 'level_up' && <LevelUpScreen />}
        {phase === 'event' && <EventScreen />}
        {phase === 'shop' && <ShopScreen />}
        {phase === 'rest' && <RestScreen />}
        {phase === 'victory' && <VictoryScreen />}
        {phase === 'defeat' && <DefeatScreen />}
      </div>
    </div>
  );
}

function TitleScreen() {
  const { content, startRun } = useGameStore();
  if (!content) return null;

  return (
    <div className="screen">
      <Header title="M A N Y   W O R L D S" subtitle="Daily Roguelike RPG" />
      <pre className="term-block">
{'\n'}
<Span color={C.fg}>  World:  </Span><Span color={C.title} bold>{content.world.name}</Span>{'\n'}
<Span color={C.dim}>  Mood:   "{content.world.mood}"</Span>{'\n'}
<Span color={C.dim}>  Seed:   {content.seed}</Span>{'\n'}
<Span color={C.dim}>  Date:   {content.date}</Span>{'\n'}
{'\n'}
      </pre>
      <Sep />
      <pre className="term-block">
        <Option index={1} label="B E G I N   R U N" onClick={startRun} color={C.title} />
      </pre>
    </div>
  );
}
