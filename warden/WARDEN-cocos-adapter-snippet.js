// WARDEN / TAPCLAP
// WARDEN-cocos-adapter-snippet.js
//
// Назначение:
// Этот модуль изолирует всё, что зависит от Cocos2d-JS.
// Остальные части WARDEN не должны самостоятельно обходить scene graph,
// читать SpriteFrame или переводить координаты Cocos в координаты браузера.
//
// Почему это отдельный модуль:
// 1. Алгоритм match-3 не должен зависеть от движка.
// 2. Если структура сцены изменится, правка останется локальной.
// 3. Если позже понадобится другой источник состояния, ядро тестирования
//    можно оставить без изменений.
//
// Текущая реализация использует публичные методы Cocos2d-JS:
// getRunningScene(), getChildren(), getPositionX/Y(), getSpriteFrame(),
// SpriteFrame.getRect(), convertToWorldSpaceAR(), cc.view.getScaleX/Y()
// и cc.view.getViewPortRect().
//
// Внутренние методы игры здесь намеренно не вызываются.

(() => {
  const DEFAULTS = {
    rows: 7,
    cols: 7,
    cellSize: 72,
    expectedTypes: 6,
    axisToleranceRatio: 0.35
  };

  function children(node) {
    try {
      return node?.getChildren?.() || [];
    } catch {
      return [];
    }
  }

  function findSprite(node) {
    // У CellView спрайт может находиться не на самом узле, а ниже по дереву.
    // Поэтому ищем первый descendant, который предоставляет публичный Sprite API.
    const queue = [node];

    while (queue.length) {
      const current = queue.shift();

      if (
        typeof current?.getSpriteFrame === 'function' ||
        typeof current?.getTexture === 'function'
      ) {
        return current;
      }

      queue.push(...children(current));
    }

    return null;
  }

  function spriteSignature(node) {
    const sprite = findSprite(node);
    const frame = sprite?.getSpriteFrame?.();
    const rect = frame?.getRect?.();

    if (!rect) return null;

    // Семантические названия цветов нам не нужны.
    // Для solver достаточно стабильного идентификатора визуального типа.
    // Координаты прямоугольника SpriteFrame в atlas подходят для этой задачи.
    return [
      Math.round(rect.x),
      Math.round(rect.y),
      Math.round(rect.width),
      Math.round(rect.height)
    ].join(':');
  }

  function clusterAxis(values, tolerance) {
    // Нельзя полагаться на индекс child в getChildren():
    // порядок дочерних узлов Cocos не соответствует row/col на доске.
    //
    // Вместо этого группируем фактические координаты по близким значениям.
    // Это делает адаптер пригодным для сеток другого размера и не требует,
    // чтобы левый верхний элемент имел координату ровно 0,0.
    const sorted = [...values].sort((a, b) => a - b);
    const clusters = [];

    for (const value of sorted) {
      let target = null;

      for (const cluster of clusters) {
        if (Math.abs(value - cluster.mean) <= tolerance) {
          target = cluster;
          break;
        }
      }

      if (!target) {
        target = { values: [], mean: value };
        clusters.push(target);
      }

      target.values.push(value);
      target.mean =
        target.values.reduce((sum, x) => sum + x, 0) /
        target.values.length;
    }

    return clusters.map(c => c.mean).sort((a, b) => a - b);
  }

  function nearestIndex(value, centers) {
    let bestIndex = -1;
    let bestDistance = Infinity;

    centers.forEach((center, index) => {
      const distance = Math.abs(value - center);

      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });

    return bestIndex;
  }

  function discoverGemLayer(config) {
    const root = cc.director.getRunningScene();

    if (!root) {
      throw new Error('WARDEN: running Cocos scene not found');
    }

    const expectedCount = config.rows * config.cols;
    const candidates = [];

    function walk(node, path = 'scene') {
      const kids = children(node);

      if (kids.length === expectedCount) {
        const signatures = kids
          .map(spriteSignature)
          .filter(Boolean);

        const unique = new Set(signatures);

        candidates.push({
          node,
          path,
          uniqueSignatures: unique.size
        });
      }

      kids.forEach((child, index) => {
        const name =
          child?.getName?.() ||
          child?.constructor?.name ||
          'node';

        walk(child, `${path}/${name}[${index}]`);
      });
    }

    walk(root);

    // В исследованной сцене фон сетки также содержит rows*cols узлов,
    // но у него одна SpriteFrame signature. У слоя фишек signatures несколько.
    const viable = candidates
      .filter(item => item.uniqueSignatures >= 2)
      .sort((a, b) => b.uniqueSignatures - a.uniqueSignatures);

    if (!viable.length) {
      throw new Error(
        `WARDEN: gem layer not found for ${config.rows}x${config.cols}`
      );
    }

    return viable[0];
  }

  function worldToClient(cell) {
    const canvas = document.querySelector('#gameCanvas');

    if (!canvas) {
      throw new Error('WARDEN: #gameCanvas not found');
    }

    const world =
      cell.convertToWorldSpaceAR(cc.p(0, 0));

    const viewport = cc.view.getViewPortRect();
    const scaleX = cc.view.getScaleX();
    const scaleY = cc.view.getScaleY();
    const rect = canvas.getBoundingClientRect();

    // Cocos считает Y снизу вверх, браузерные client coordinates сверху вниз.
    const pixelX = viewport.x + world.x * scaleX;
    const pixelYFromBottom = viewport.y + world.y * scaleY;
    const pixelY = canvas.height - pixelYFromBottom;

    // Canvas может иметь backing-store размер, отличный от CSS-размера.
    return {
      x: rect.left + pixelX * (rect.width / canvas.width),
      y: rect.top + pixelY * (rect.height / canvas.height)
    };
  }

  function create(userConfig = {}) {
    const config = {
      ...DEFAULTS,
      ...userConfig
    };

    if (!Number.isInteger(config.rows) || config.rows < 2) {
      throw new RangeError('WARDEN: rows must be an integer >= 2');
    }

    if (!Number.isInteger(config.cols) || config.cols < 2) {
      throw new RangeError('WARDEN: cols must be an integer >= 2');
    }

    if (!(config.cellSize > 0)) {
      throw new RangeError('WARDEN: cellSize must be > 0');
    }

    function read({ silent = false } = {}) {
      const candidate = discoverGemLayer(config);
      const layer = candidate.node;
      const cells = children(layer);

      const raw = cells.map(cell => ({
        cell,
        x: cell.getPositionX?.() ?? 0,
        y: cell.getPositionY?.() ?? 0,
        signature: spriteSignature(cell)
      }));

      const tolerance =
        config.cellSize * config.axisToleranceRatio;

      const xCenters =
        clusterAxis(raw.map(item => item.x), tolerance);

      if (xCenters.length !== config.cols) {
        throw new Error(
          `WARDEN: expected ${config.cols} column centers, got ${xCenters.length}`
        );
      }

      const yCenters =
        clusterAxis(raw.map(item => item.y), tolerance)
          .sort((a, b) => b - a);

      if (yCenters.length !== config.rows) {
        throw new Error(
          `WARDEN: expected ${config.rows} row centers, got ${yCenters.length}`
        );
      }

      const signatures = [
        ...new Set(
          raw
            .map(item => item.signature)
            .filter(Boolean)
        )
      ].sort();

      const tokenMap = new Map(
        signatures.map((signature, index) => [
          signature,
          String.fromCharCode(65 + index)
        ])
      );

      const board = Array.from(
        { length: config.rows },
        () => Array(config.cols).fill('?')
      );

      const points = Array.from(
        { length: config.rows },
        () => Array(config.cols).fill(null)
      );

      const nodes = Array.from(
        { length: config.rows },
        () => Array(config.cols).fill(null)
      );

      const mapped = [];

      for (const item of raw) {
        const row = nearestIndex(item.y, yCenters);
        const col = nearestIndex(item.x, xCenters);

        if (
          row < 0 || row >= config.rows ||
          col < 0 || col >= config.cols
        ) {
          continue;
        }

        const token =
          tokenMap.get(item.signature) ?? '?';

        if (nodes[row][col]) {
          throw new Error(
            `WARDEN: duplicate node mapping for [${row},${col}]`
          );
        }

        board[row][col] = token;
        points[row][col] = worldToClient(item.cell);
        nodes[row][col] = item.cell;

        mapped.push({
          row,
          col,
          token,
          signature: item.signature,
          node: item.cell
        });
      }

      const complete =
        board.every(row =>
          row.every(value => value !== '?')
        );

      const expectedTypesOk =
        config.expectedTypes == null ||
        signatures.length === config.expectedTypes;

      const safe =
        complete && expectedTypesOk;

      const snapshot = {
        board,
        points,
        nodes,
        mapped,
        signatures,
        tokenMap,
        complete,
        safe,
        layer,
        layerPath: candidate.path,
        config: { ...config }
      };

      if (!silent) {
        console.table(
          board.map((row, index) => ({
            row: index,
            cells: row.join(' ')
          }))
        );

        console.log('[WARDEN adapter] board', {
          complete,
          safe,
          types: signatures.length,
          layerPath: candidate.path
        });
      }

      return snapshot;
    }

    return {
      config: { ...config },
      read,
      worldToClient
    };
  }

  window.WARDENCocosAdapter = {
    create
  };

  console.log('[WARDEN] Cocos adapter loaded');
})();
