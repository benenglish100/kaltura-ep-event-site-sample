// Finds the Event Platform uiconfs on an account, so nobody has to hunt for IDs.
// EP-enabled accounts are auto-provisioned with these (names/tags as of KEP widgets 7.x):
//   player    "EP All Plugins (Do Not Delete)"                       tags: kalturaPlayerJs,player,ovp
//   CnC       "KEP widgets - default UIconf for EP - latest"         tags: kep-collaboration-widgets_latest
//   reactions "KEP reactions widgets latest (Do Not Delete)"         tags: kep_reactions_widgets
// Accounts with a MediaSpace events site also have "C&C Widget Player" / "C&C Reactions Player" copies.

const has = (u, re) => re.test(`${u.tags || ''} ${u.name || ''}`);

export async function listUiConfs(kalturaApi, adminKs) {
  const result = await kalturaApi.call(
    'uiConf',
    'list',
    {
      filter: { objectType: 'KalturaUiConfFilter', orderBy: '-createdAt' },
      pager: { objectType: 'KalturaFilterPager', pageSize: 500 },
    },
    adminKs,
  );
  return result.objects || [];
}

/** Returns candidate lists, best first, for each component. */
export function classifyUiConfs(uiConfs) {
  const cnc = uiConfs.filter((u) => has(u, /kep-collaboration-widgets|collaborationWidget/i));
  const reactions = uiConfs.filter((u) => has(u, /kep[-_]reactions[-_]widgets|reactionsWidget/i));
  const players = uiConfs
    .filter((u) => has(u, /kalturaPlayerJs/i) && !cnc.includes(u) && !reactions.includes(u))
    .sort((a, b) => rankPlayer(b) - rankPlayer(a));

  // Prefer the EP-provisioned copies over MediaSpace ones.
  const epFirst = (list) => [...list].sort((a, b) => Number(/kep/i.test(b.tags || '')) - Number(/kep/i.test(a.tags || '')));
  return { players, cnc: epFirst(cnc), reactions: epFirst(reactions) };
}

function rankPlayer(u) {
  if (/EP All Plugins/i.test(u.name)) return 3;
  if (/webcast/i.test(u.name)) return 2;
  if (/^EP /i.test(u.name)) return 1;
  return 0;
}

export const embedUrl = (cdnUrl, partnerId, uiConfId) => `${cdnUrl}/p/${partnerId}/embedPlaykitJs/uiconf_id/${uiConfId}`;
