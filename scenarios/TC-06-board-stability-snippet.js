// TC-06 — Stable board reads
// После waitStable() несколько последовательных чтений должны возвращать
// одну и ту же логическую матрицу. Это проверяет пригодность board reader
// как основы для дальнейших сценариев.

(async () => {
  const warden =
    window.warden ||
    (window.warden = await WARDEN.init({
      rows: 7,
      cols: 7,
      cellSize: 72,
      expectedTypes: 6
    }));

  const key = board =>
    board.map(row => row.join('')).join('/');

  const first = await warden.waitStable();

  await new Promise(
    resolve => setTimeout(resolve, 300)
  );

  const second =
    warden.read({ silent: true });

  warden.assert(
    first.complete && second.complete,
    'TC-06: one of the board reads is incomplete'
  );

  warden.assert(
    key(first.board) === key(second.board),
    'TC-06: stable board changed between repeated reads'
  );

  console.log('[TC-06] PASS', {
    board: second.board
  });
})();
