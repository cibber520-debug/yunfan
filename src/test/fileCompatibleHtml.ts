interface BuildAssetTags {
  readonly scripts: readonly string[];
  readonly styles: readonly string[];
}

const ASSET_PREFIX_PATTERN: RegExp = /^(?:\.\/|\/)assets\//;

/** 从构建资源 URL 提取不含目录的安全文件名。 */
function getAssetFileName(assetPath: string): string {
  if (!ASSET_PREFIX_PATTERN.test(assetPath)) {
    throw new Error(`生产入口包含不受支持的资源路径: ${assetPath}`);
  }
  const fileName: string = assetPath.replace(ASSET_PREFIX_PATTERN, '');
  if (fileName.length === 0 || /[/\\]/.test(fileName)) {
    throw new Error(`生产入口包含无效的资源文件名: ${assetPath}`);
  }
  return fileName;
}

/** 创建协议感知、无 parser 预扫描竞态的静态资源启动脚本。 */
export function createAssetBootstrap(
  scriptPaths: readonly string[],
  stylePaths: readonly string[],
): string {
  const scriptFiles: readonly string[] = scriptPaths.map(getAssetFileName);
  const styleFiles: readonly string[] = stylePaths.map(getAssetFileName);
  return `<script>(function(){var base=location.protocol==='file:'?'./assets/':'/assets/';var styles=${JSON.stringify(styleFiles)};var scripts=${JSON.stringify(scriptFiles)};styles.forEach(function(file){var link=document.createElement('link');link.rel='stylesheet';link.href=base+file;document.head.appendChild(link);});function load(index){if(index>=scripts.length){return;}var script=document.createElement('script');script.src=base+scripts[index];script.onload=function(){load(index+1);};document.head.appendChild(script);}load(0);}());</script>`;
}

/** 收集并移除 Vite 生成的 JS/CSS 外链标签。 */
function extractBuildAssetTags(html: string): BuildAssetTags {
  const scripts: string[] = [];
  const styles: string[] = [];
  html.replace(
    /<script\b(?=[^>]*\bsrc="([^"]+)")[^>]*><\/script>/g,
    (tag: string, assetPath: string): string => {
      if (ASSET_PREFIX_PATTERN.test(assetPath)) {
        scripts.push(assetPath);
      }
      return tag;
    },
  );
  html.replace(
    /<link\b(?=[^>]*\brel="stylesheet")(?=[^>]*\bhref="([^"]+)")[^>]*>/g,
    (tag: string, assetPath: string): string => {
      if (ASSET_PREFIX_PATTERN.test(assetPath)) {
        styles.push(assetPath);
      }
      return tag;
    },
  );
  return { scripts, styles };
}

/** 将 Vite 资源标签转换为 protocol-aware 动态启动脚本。 */
export function transformFileCompatibleHtml(html: string): string {
  const assets: BuildAssetTags = extractBuildAssetTags(html);
  if (assets.scripts.length === 0 || assets.styles.length === 0) {
    throw new Error('生产入口缺少预期的脚本或样式资源标签');
  }
  const withoutScripts: string = html.replace(
    /<script\b(?=[^>]*\bsrc="(?:\.\/|\/)assets\/)[^>]*><\/script>/g,
    '',
  );
  const withoutAssets: string = withoutScripts.replace(
    /<link\b(?=[^>]*\brel="stylesheet")(?=[^>]*\bhref="(?:\.\/|\/)assets\/)[^>]*>/g,
    '',
  );
  return withoutAssets.replace('</head>', `    ${createAssetBootstrap(assets.scripts, assets.styles)}\n  </head>`);
}
