// TC-04 — Native hint validation
// Ничего не нажимаем и ждём штатную hint-анимацию.
// Observer пытается определить подсказанную пару по публичным свойствам Node.
// VALID_HINT означает, что подсказка входит в независимый список legal moves.
// INVALID_HINT — кандидат на дефект.
// AMBIGUOUS — observer не смог уверенно распознать анимацию и тест не считается
// проваленным.

(async () => {
  const warden =
    window.warden ||
    (window.warden = await WARDEN.init({
      rows: 7,
      cols: 7,
      cellSize: 72,
      expectedTypes: 6
    }));

  console.log(
    '[TC-04] Do not interact with the board while the hint observer is running.'
  );

  const result =
    await warden.validateHint({
      duration: 4500,
      interval: 100
    });

  if (result.status === 'INVALID_HINT') {
    throw new Error(
      `TC-04: native hint is not a legal move: ${JSON.stringify(result)}`
    );
  }

  if (result.status === 'AMBIGUOUS') {
    console.warn(
      '[TC-04] INCONCLUSIVE: hint animation was not identified confidently',
      result
    );
    return;
  }

  warden.assert(
    result.status === 'VALID_HINT',
    `TC-04: unexpected hint observer status: ${result.status}`
  );

  console.log('[TC-04] PASS', result);
})();
