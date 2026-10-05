// WARDEN / TAPCLAP
// WARDEN-core-snippet.js
//
// Назначение:
// Центральное ядро небольшого test harness.
//
// Ядро знает правила проверки match-3, но не знает деталей Cocos scene graph
// и не отправляет браузерные события напрямую. Для этого используются
// отдельные adapter/input modules.
//
// Принцип:
// - adapter читает фактическое состояние;
// - core независимо рассчитывает legal moves;
// - input driver выполняет выбранное действие;
// - после действия core снова читает фактическое состояние;
// - если ожидание не подтверждается, сохраняется диагностический результат.
//
// Внутренний игровой метод проверки хода намеренно не используется:
// WARDEN должен оставаться независимым oracle для базовых match-3 правил.

(() => {
  const sleep = ms =>
    new Promise(resolve => setTimeout(resolve, ms));

  function boardKey(board) {
    return board.map(row => row.join('')).join('/');
  }

  function cloneBoard(board) {
    return board.map(row => [...row]);
  }

  function normalizePair(move) {
    return [move.from, move.to]
      .map(cell => `${cell[0]},${cell[1]}`)
      .sort()
      .join('|');
  }

  function initConfig(userConfig = {}) {
    return {
      rows: 7,
      cols: 7,
      cellSize: 72,
      expectedTypes: 6,
      stableTimeout: 6000,
      stableInterval: 250,
      stableSamples: 3,
      settleAfterInput: 250,
      ...userConfig
    };
  }

  async function init(userConfig = {}) {
    const config = initConfig(userConfig);

    if (!window.WARDENCocosAdapter) {
      throw new Error(
        'WARDEN: load WARDEN-cocos-adapter-snippet.js first'
      );
    }

    if (!window.WARDENInputDriver) {
      throw new Error(
        'WARDEN: load WARDEN-input-driver-snippet.js first'
      );
    }

    const adapter =
      window.WARDENCocosAdapter.create(config);

    const input =
      window.WARDENInputDriver.create(config);

    const state = {
      running: false,
      stopped: false,
      steps: 0,
      lastResult: null,
      history: []
    };

    function assert(condition, message = 'WARDEN assertion failed') {
      if (!condition) throw new Error(message);
      return true;
    }

    function hasMatchAt(board, row, col) {
      const value = board[row]?.[col];

      if (!value || value === '?') return false;

      let count = 1;

      for (
        let x = col - 1;
        x >= 0 && board[row][x] === value;
        x--
      ) count++;

      for (
        let x = col + 1;
        x < config.cols && board[row][x] === value;
        x++
      ) count++;

      if (count >= 3) return true;

      count = 1;

      for (
        let y = row - 1;
        y >= 0 && board[y][col] === value;
        y--
      ) count++;

      for (
        let y = row + 1;
        y < config.rows && board[y][col] === value;
        y++
      ) count++;

      return count >= 3;
    }

    function allAdjacentMoves(board) {
      const result = [];

      for (let row = 0; row < config.rows; row++) {
        for (let col = 0; col < config.cols; col++) {
          for (const [dRow, dCol] of [[0, 1], [1, 0]]) {
            const toRow = row + dRow;
            const toCol = col + dCol;

            if (
              toRow >= config.rows ||
              toCol >= config.cols
            ) continue;

            result.push({
              from: [row, col],
              to: [toRow, toCol],
              fromToken: board[row][col],
              toToken: board[toRow][toCol]
            });
          }
        }
      }

      return result;
    }

    function legalMovesForBoard(board) {
      const result = [];

      for (const move of allAdjacentMoves(board)) {
        const [row, col] = move.from;
        const [toRow, toCol] = move.to;

        if (
          board[row][col] === '?' ||
          board[toRow][toCol] === '?'
        ) continue;

        const copy = cloneBoard(board);

        [
          copy[row][col],
          copy[toRow][toCol]
        ] = [
          copy[toRow][toCol],
          copy[row][col]
        ];

        if (
          hasMatchAt(copy, row, col) ||
          hasMatchAt(copy, toRow, toCol)
        ) {
          result.push(move);
        }
      }

      return result;
    }

    function read({ silent = false } = {}) {
      return adapter.read({ silent });
    }

    function legalMoves() {
      const snapshot = read({ silent: true });
      return legalMovesForBoard(snapshot.board);
    }

    function moves() {
      const snapshot = read({ silent: true });

      if (!snapshot.safe) {
        throw new Error(
          `WARDEN: unsafe board, complete=${snapshot.complete}, types=${snapshot.signatures.length}`
        );
      }

      const result = legalMovesForBoard(snapshot.board);

      console.table(
        result.map(move => ({
          from: `[${move.from}]`,
          to: `[${move.to}]`,
          fromToken: move.fromToken,
          toToken: move.toToken
        }))
      );

      return result;
    }

    async function waitStable({
      timeout = config.stableTimeout,
      interval = config.stableInterval,
      samples = config.stableSamples
    } = {}) {
      const started = performance.now();
      let previous = null;
      let consecutive = 0;

      while (performance.now() - started < timeout) {
        if (state.stopped) {
          throw new Error('WARDEN: stop requested');
        }

        let snapshot;

        try {
          snapshot = read({ silent: true });
        } catch {
          await sleep(interval);
          continue;
        }

        if (!snapshot.safe) {
          previous = null;
          consecutive = 0;
          await sleep(interval);
          continue;
        }

        const key = boardKey(snapshot.board);

        if (key === previous) {
          consecutive++;
        } else {
          previous = key;
          consecutive = 1;
        }

        if (consecutive >= samples) {
          return snapshot;
        }

        await sleep(interval);
      }

      throw new Error(
        'WARDEN: board did not reach a stable readable state'
      );
    }

    async function perform(
      move,
      {
        requireLegal = true,
        expectChange = true
      } = {}
    ) {
      const before = await waitStable();
      const currentLegal = legalMovesForBoard(before.board);

      const legal =
        currentLegal.some(candidate =>
          normalizePair(candidate) === normalizePair(move)
        );

      if (requireLegal && !legal) {
        throw new Error(
          `WARDEN: requested move is not legal: ${JSON.stringify(move)}`
        );
      }

      const [row, col] = move.from;
      const [toRow, toCol] = move.to;
      const from = before.points[row]?.[col];
      const to = before.points[toRow]?.[toCol];

      if (!from || !to) {
        throw new Error(
          'WARDEN: missing browser coordinates for move'
        );
      }

      const beforeKey = boardKey(before.board);

      console.log('[WARDEN] perform', {
        from: move.from,
        to: move.to,
        requireLegal,
        expectChange
      });

      await input.drag(from, to);
      await sleep(config.settleAfterInput);

      const after = await waitStable();
      const afterKey = boardKey(after.board);
      const changed = beforeKey !== afterKey;

      const result = {
        status: changed ? 'BOARD_CHANGED' : 'BOARD_UNCHANGED',
        legal,
        expectedChange: expectChange,
        expectationMet: expectChange ? changed : !changed,
        move,
        before: before.board,
        after: after.board,
        changed,
        timestamp: new Date().toISOString()
      };

      state.steps++;
      state.lastResult = result;
      state.history.push(result);

      if (result.expectationMet) {
        console.log('[WARDEN] PASS', result.status);
      } else {
        console.warn('[WARDEN] EXPECTATION NOT MET', result);
      }

      return result;
    }

    async function step({ moveIndex = 0 } = {}) {
      const snapshot = await waitStable();
      const candidates = legalMovesForBoard(snapshot.board);

      if (!candidates.length) {
        const result = {
          status: 'NO_LEGAL_MOVE',
          board: snapshot.board,
          timestamp: new Date().toISOString()
        };

        state.lastResult = result;
        state.history.push(result);
        console.warn('[WARDEN] no legal move');
        return result;
      }

      const move =
        candidates[
          Math.min(
            Math.max(moveIndex, 0),
            candidates.length - 1
          )
        ];

      const result =
        await perform(move, {
          requireLegal: true,
          expectChange: true
        });

      if (!result.changed) {
        result.status = 'INPUT_NO_CHANGE';
        console.warn(
          '[WARDEN] legal move was sent but the board did not change'
        );
      } else {
        result.status = 'MOVED';
      }

      return result;
    }

    async function run({
      maxSteps = 10,
      pause = 350
    } = {}) {
      if (state.running) {
        throw new Error('WARDEN: run() already active');
      }

      state.running = true;
      state.stopped = false;
      const results = [];

      console.log('[WARDEN] RUN START', { maxSteps });

      try {
        for (let index = 0; index < maxSteps; index++) {
          if (state.stopped) break;

          const result = await step();
          results.push(result);

          if (result.status !== 'MOVED') break;
          await sleep(pause);
        }
      } catch (error) {
        const diagnostic = {
          status:
            /gem layer|running Cocos scene/i.test(String(error))
              ? 'BOARD_OR_SCENE_DISAPPEARED'
              : 'ERROR',
          error: String(error),
          timestamp: new Date().toISOString()
        };

        results.push(diagnostic);
        state.history.push(diagnostic);
        console.warn('[WARDEN] RUN STOP', diagnostic);
      } finally {
        state.running = false;
      }

      console.log(
        state.stopped
          ? '[WARDEN] RUN STOPPED'
          : '[WARDEN] RUN FINISHED'
      );

      return results;
    }

    function findInvalidAdjacent() {
      const current = read({ silent: true });
      const legalSet =
        new Set(
          legalMovesForBoard(current.board)
            .map(normalizePair)
        );

      return (
        allAdjacentMoves(current.board)
          .find(move => !legalSet.has(normalizePair(move))) ||
        null
      );
    }

    let hintObserver = null;

    if (window.WARDENHintObserver) {
      hintObserver =
        window.WARDENHintObserver.create({
          adapter,
          legalMoves: legalMovesForBoard
        });
    }

    async function observeHint(options = {}) {
      if (!hintObserver) {
        return {
          status: 'UNAVAILABLE',
          reason:
            'WARDEN-hint-observer-snippet.js was not loaded'
        };
      }

      const result =
        await hintObserver.observe(options);

      console.log('[WARDEN] hint observation', result);
      return result;
    }

    async function validateHint(options = {}) {
      return observeHint(options);
    }

    function snapshot() {
      return {
        config: { ...config },
        state: {
          running: state.running,
          stopped: state.stopped,
          steps: state.steps,
          lastResult: state.lastResult,
          historyLength: state.history.length
        },
        board: (() => {
          try {
            return read({ silent: true }).board;
          } catch (error) {
            return { error: String(error) };
          }
        })(),
        legalMoves: (() => {
          try {
            return legalMoves();
          } catch {
            return [];
          }
        })(),
        timestamp: new Date().toISOString()
      };
    }

    function stop() {
      state.stopped = true;
      console.log('[WARDEN] stop requested');
    }

    function resetStop() {
      state.stopped = false;
    }

    const api = {
      config: { ...config },
      read,
      legalMoves,
      moves,
      allAdjacentMoves: () => {
        const current = read({ silent: true });
        return allAdjacentMoves(current.board);
      },
      findInvalidAdjacent,
      waitStable,
      perform,
      step,
      run,
      observeHint,
      validateHint,
      assert,
      snapshot,
      stop,
      resetStop,
      state
    };

    console.log('[WARDEN] initialized', {
      rows: config.rows,
      cols: config.cols,
      cellSize: config.cellSize,
      expectedTypes: config.expectedTypes
    });

    return api;
  }

  window.WARDEN = { init };

  console.log('[WARDEN] core loaded');
})();
