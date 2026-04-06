import { useState, useMemo } from 'react';
import { useGameStore } from '../state/game.js';
import { Header, Span, Option, Sep, Bar, C, TERM_WIDTH } from '../components/Terminal.js';

export function InterviewScreen() {
  const { content, answerQuestion, finishInterview, interviewAffinities } = useGameStore();
  const [questionIdx, setQuestionIdx] = useState(0);

  if (!content) return null;
  const archetypes = content.characters;
  const totalQuestions = archetypes.length;

  const questions = archetypes.map((a) => ({
    archetype: a,
    question: a.interviewQuestions[0],
  }));

  const selectedArch = useMemo(() => {
    if (questionIdx < totalQuestions) return null;
    let bestId = archetypes[0].id;
    let bestScore = 0;
    for (const a of archetypes) {
      if ((interviewAffinities[a.id] ?? 0) > bestScore) {
        bestScore = interviewAffinities[a.id];
        bestId = a.id;
      }
    }
    return archetypes.find((a) => a.id === bestId)!;
  }, [questionIdx, totalQuestions, archetypes, interviewAffinities]);

  if (selectedArch) {
    const s = selectedArch.stats;
    return (
      <div className="screen">
        <Header title={selectedArch.name} subtitle={selectedArch.class} />
        <pre className="term-block">
{'\n'}
<Span color={C.dim}>  "{selectedArch.lore}"</Span>{'\n'}
{'\n'}
<Span color={C.dim}>  ─── Stats ───</Span>{'\n'}
{'  '}<Span color={C.hp}>HP {String(s.maxHp).padStart(3)}</Span>{'  '}<Span color={C.mp}>MP {String(s.maxMp).padStart(3)}</Span>{'  '}<Span color={C.fire}>ATK {String(s.attack).padStart(2)}</Span>{'  '}<Span color={C.earth}>DEF {String(s.defense).padStart(2)}</Span>{'  '}<Span color={C.player}>SPD {String(s.speed).padStart(2)}</Span>{'  '}<Span color={C.gold}>LCK {String(s.luck).padStart(2)}</Span>{'\n'}
{'\n'}
<Span color={C.dim}>  ─── Abilities ───</Span>{'\n'}
{selectedArch.startingAbilities.map((a) => (
  <span key={a.id}>
    {'  '}<Span color={C.selected}>{a.name}</Span> <Span color={C.mp}>({a.mpCost} MP)</Span> <Span color={C.dim}>— {a.description}</Span>{'\n'}
  </span>
))}
{'\n'}
<Span color={C.dim}>  ─── Passive ───</Span>{'\n'}
{'  '}<Span color={C.blessing}>{selectedArch.passiveTrait.name}</Span>{'\n'}
{'  '}<Span color={C.dim}>{selectedArch.passiveTrait.description}</Span>{'\n'}
{'\n'}
        </pre>
        <Sep />
        <pre className="term-block">
          <Option index={1} label="Continue" onClick={finishInterview} color={C.title} />
        </pre>
      </div>
    );
  }

  const current = questions[questionIdx];
  return (
    <div className="screen">
      <Header title="W H O   A R E   Y O U ?" />
      <pre className="term-block">
{'\n'}
<Span color={C.dim}>  Three figures await in the ash. Answer truthfully.</Span>{'\n'}
<Span color={C.dim}>  Question {questionIdx + 1} of {totalQuestions}</Span>{'\n'}
{'\n'}
<Span color={C.fg}>  {current.question.question}</Span>{'\n'}
{'\n'}
      </pre>
      <pre className="term-block">
        {current.question.options.map((opt, i) => (
          <Option
            key={i}
            index={i + 1}
            label={opt.text}
            onClick={() => {
              answerQuestion(opt.archetypeAffinity);
              setQuestionIdx(questionIdx + 1);
            }}
          />
        ))}
      </pre>
    </div>
  );
}
