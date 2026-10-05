// WARDEN / TAPCLAP
// WARDEN-hint-observer-snippet.js
//
// Назначение:
// Наблюдать штатную hint-анимацию игры только через публично доступные
// свойства Cocos Node и сравнивать подсказанную пару с независимым списком
// legal moves WARDEN.
//
// Этот модуль экспериментальный.
// Он не должен объявлять баг, если не смог уверенно выделить две клетки.
// В таком случае результат должен быть AMBIGUOUS.
//
// Идея:
// 1. Получить стабильную сетку и Node для каждой клетки.
// 2. Несколько секунд сэмплировать position, scale и opacity.
// 3. Посчитать накопленное изменение для каждой клетки.
// 4. Найти две наиболее "движущиеся" соседние клетки.
// 5. Проверить, входит ли эта пара в независимый список legal moves.
//
// Если в конкретной сборке hint реализован не изменением этих публичных
// свойств, observer честно вернёт AMBIGUOUS.

(() => {
  const sleep = ms =>
    new Promise(resolve => setTimeout(resolve, ms));

  function nodeSample(node) {
    if (!node) return null;

    const opacity =
      typeof node.getOpacity === 'function'
        ? node.getOpacity()
        : 255;

    const scaleX =
      typeof node.getScaleX === 'function'
        ? node.getScaleX()
        : 1;

    const scaleY =
      typeof node.getScaleY === 'function'
        ? node.getScaleY()
        : 1;

    return {
      x: node.getPositionX?.() ?? 0,
      y: node.getPositionY?.() ?? 0,
      scaleX,
      scaleY,
      opacity
    };
  }

  function distance(a, b) {
    if (!a || !b) return 0;

    // Scale получает заметный вес, потому что подсказки часто используют пульс.
    // Коэффициенты здесь являются эвристикой observer, а не логикой игры.
    return (
      Math.abs(a.x - b.x) +
      Math.abs(a.y - b.y) +
      60 * Math.abs(a.scaleX - b.scaleX) +
      60 * Math.abs(a.scaleY - b.scaleY) +
      0.25 * Math.abs(a.opacity - b.opacity)
    );
  }

  function samePair(a, b) {
    if (!a || !b) return false;

    const normalize = pair =>
      pair
        .map(cell => `${cell[0]},${cell[1]}`)
        .sort()
        .join('|');

    return normalize(a) === normalize(b);
  }

  function create({ adapter, legalMoves }) {
    if (!adapter) {
      throw new Error('WARDEN hint observer: adapter required');
    }

    if (typeof legalMoves !== 'function') {
      throw new Error('WARDEN hint observer: legalMoves function required');
    }

    async function observe({
      duration = 4500,
      interval = 100,
      minScore = 1.5,
      dominanceRatio = 1.25
    } = {}) {
      const snapshot =
        adapter.read({ silent: true });

      if (!snapshot.safe) {
        return {
          status: 'UNSAFE_BOARD',
          reason: 'Board is not safe to observe'
        };
      }

      const tracks = new Map();

      for (let row = 0; row < snapshot.config.rows; row++) {
        for (let col = 0; col < snapshot.config.cols; col++) {
          tracks.set(`${row},${col}`, {
            row,
            col,
            node: snapshot.nodes[row][col],
            previous: null,
            score: 0
          });
        }
      }

      const started = performance.now();

      while (performance.now() - started < duration) {
        for (const track of tracks.values()) {
          const current = nodeSample(track.node);

          if (track.previous) {
            track.score += distance(track.previous, current);
          }

          track.previous = current;
        }

        await sleep(interval);
      }

      const ranking =
        [...tracks.values()]
          .sort((a, b) => b.score - a.score);

      const first = ranking[0];
      const second = ranking[1];
      const third = ranking[2];

      if (!first || !second) {
        return {
          status: 'AMBIGUOUS',
          reason: 'Not enough observed cells'
        };
      }

      const adjacent =
        Math.abs(first.row - second.row) +
        Math.abs(first.col - second.col) === 1;

      const enoughMotion =
        first.score >= minScore &&
        second.score >= minScore;

      const enoughDominance =
        !third ||
        second.score >= third.score * dominanceRatio;

      if (!adjacent || !enoughMotion || !enoughDominance) {
        return {
          status: 'AMBIGUOUS',
          reason: 'Animation signal is not a clear adjacent pair',
          ranking: ranking.slice(0, 6).map(item => ({
            row: item.row,
            col: item.col,
            score: Number(item.score.toFixed(3))
          }))
        };
      }

      const pair = [
        [first.row, first.col],
        [second.row, second.col]
      ];

      const board =
        adapter.read({ silent: true }).board;

      const moves = legalMoves(board);

      const valid =
        moves.some(move =>
          samePair(pair, [move.from, move.to])
        );

      return {
        status: valid ? 'VALID_HINT' : 'INVALID_HINT',
        pair,
        scores: [
          Number(first.score.toFixed(3)),
          Number(second.score.toFixed(3))
        ],
        legalMoves: moves
      };
    }

    return { observe };
  }

  window.WARDENHintObserver = { create };

  console.log('[WARDEN] hint observer loaded');
})();
