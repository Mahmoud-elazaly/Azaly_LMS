import { labTemplate } from './protocol.mjs';

export async function checkWorkspace(version, readConfig, readPreview) {
  const { checkerVersion, configurations, previews, target } = labTemplate(version);
  const configuration = await readConfig();
  const preview = await readPreview();
  return { checkerVersion, configurationOk: configuration === configurations[target], responseOk: preview === previews[target] };
}
