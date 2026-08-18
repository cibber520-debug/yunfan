import { describe, expect, it } from 'vitest';
import { createAssetBootstrap, transformFileCompatibleHtml } from './fileCompatibleHtml';

const viteHtml: string = `<!doctype html><html><head>
<script type="module" crossorigin src="./assets/index-app.js"></script>
<link rel="stylesheet" crossorigin href="./assets/index-app.css">
</head><body><div id="root"></div></body></html>`;

describe('离线与 HTTP 共用的生产入口转换', () => {
  it('隐藏资源 URL，避免 HTML 预扫描在 HTTP 深链请求相对资源', () => {
    const html: string = transformFileCompatibleHtml(viteHtml);
    expect(html).not.toMatch(/<(?:script|link)[^>]+(?:src|href)="\.\/assets\//);
    expect(html).not.toMatch(/<script[^>]+type="module"/);
    expect(html).not.toContain('document.write');
    expect(html).toContain("location.protocol==='file:'?'./assets/':'/assets/'");
    expect(html).toContain("document.createElement('link')");
    expect(html).toContain("document.createElement('script')");
  });

  it('file 使用 dist 相对资源，HTTP(S) 使用站点根资源', () => {
    const bootstrap: string = createAssetBootstrap(
      ['./assets/vendor.js', './assets/index.js'],
      ['./assets/index.css'],
    );
    expect(bootstrap).toContain("location.protocol==='file:'?'./assets/':'/assets/'");
    expect(bootstrap).toContain('["vendor.js","index.js"]');
    expect(bootstrap).toContain('["index.css"]');
    expect(bootstrap).not.toContain('src="./assets');
    expect(bootstrap).not.toContain('href="./assets');
  });

  it('按数组顺序串行加载 classic scripts', () => {
    const bootstrap: string = createAssetBootstrap(
      ['/assets/runtime.js', '/assets/app.js'],
      ['/assets/app.css'],
    );
    expect(bootstrap).toContain('script.onload=function(){load(index+1);}');
    expect(bootstrap).toContain('script.src=base+scripts[index]');
    expect(bootstrap).not.toContain('type=\'module\'');
  });

  it('拒绝非 assets 路径，避免将任意 URL 注入启动脚本', () => {
    expect(() => createAssetBootstrap(['https://example.com/app.js'], ['./assets/app.css']))
      .toThrow('生产入口包含不受支持的资源路径');
  });

  it('构建标签不完整时失败，防止静默产出空白页', () => {
    expect(() => transformFileCompatibleHtml('<html></html>')).toThrow(
      '生产入口缺少预期的脚本或样式资源标签',
    );
  });
});
