// Exercise the same navigation a teacher uses. Standalone widgets retain their flat tabs.
export async function openTool(page, id, gesture = 'click') {
  const tab = page.locator('.fe-tab[data-tab="'+id+'"]');
  const name = ['text','element'].includes(id) ? 'add' : id === 'upload' ? 'media' : 'design';
  const group = page.locator('[data-tool-group="'+name+'"]');
  await page.locator('.fe-tabs').first().waitFor();
  if (await group.count()) {
    if (id === 'upload') {
      if (await group.getAttribute('aria-expanded') !== 'true') await group[gesture]();
      return;
    }
    if (!await tab.isVisible()) await group[gesture]();
    await tab.waitFor();
    if (await tab.getAttribute('aria-selected') !== 'true') await tab[gesture]();
  } else await tab[gesture]();
}
