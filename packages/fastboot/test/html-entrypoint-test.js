'use strict';

const tmp = require('tmp');
const { expect, Assertion } = require('chai');
const fixturify = require('fixturify');
const htmlEntrypoint = require('../src/html-entrypoint.js');
const { JSDOM } = require('jsdom');

tmp.setGracefulCleanup();

Assertion.addChainableMethod('equalHTML', function(expectedHTML) {
  function normalizeHTML(html) {
    return new JSDOM(html).serialize().replace(/[ \t]*\n[ \t]*/g, '\n');
  }
  let actualHTML = normalizeHTML(this._obj);
  expectedHTML = normalizeHTML(expectedHTML);
  this.assert(
    actualHTML === expectedHTML,
    'expected HTML #{this} to equal #{act}',
    'expected HTML #{this} to not equal #{act}',
    expectedHTML,
    actualHTML
  );
});

describe('htmlEntrypoint', function() {
  it('correctly works with no scripts', function() {
    let tmpobj = tmp.dirSync();
    let tmpLocation = tmpobj.name;

    let project = {
      'index.html': `
        <html>
          <body>
          </body>
        </html>`,
    };

    fixturify.writeSync(tmpLocation, project);

    let { html, scripts } = htmlEntrypoint('my-app', tmpLocation, 'index.html');

    expect(html).to.be.equalHTML(project['index.html']);
    expect(scripts).to.deep.equal([]);
  });

  it('correctly works with scripts', function() {
    let tmpobj = tmp.dirSync();
    let tmpLocation = tmpobj.name;

    let project = {
      'index.html': `
        <html>
          <body>
            <script src="foo.js"></script>
            <script src="bar.js"></script>
            <script src="baz.js"></script>
          </body>
        </html>`,
    };

    fixturify.writeSync(tmpLocation, project);

    let { html, scripts } = htmlEntrypoint('my-app', tmpLocation, 'index.html');

    expect(html).to.be.equalHTML(project['index.html']);
    expect(scripts).to.deep.equal([
      `${tmpLocation}/foo.js`,
      `${tmpLocation}/bar.js`,
      `${tmpLocation}/baz.js`,
    ]);
  });

  it('consumes and removes fastboot-scripts', function() {
    let tmpobj = tmp.dirSync();
    let tmpLocation = tmpobj.name;

    let project = {
      'index.html': `
        <html>
          <body>
            <fastboot-script src="foo.js"></fastboot-script>
            <script src="bar.js"></script>
          </body>
        </html>
      `,
    };

    fixturify.writeSync(tmpLocation, project);

    let { html, scripts } = htmlEntrypoint('my-app', tmpLocation, 'index.html');

    expect(html).to.be.equalHTML(`
      <html>
        <body>
          <script src="bar.js"></script>
        </body>
      </html>
  `);

    expect(scripts).to.deep.equal([`${tmpLocation}/foo.js`, `${tmpLocation}/bar.js`]);
  });

  it('trims whitespace when removing fastboot-scripts', function() {
    let tmpobj = tmp.dirSync();
    let tmpLocation = tmpobj.name;

    let project = {
      'index.html': `
        <html>
          <body>
            <fastboot-script src="foo.js"></fastboot-script><script src="bar.js"></script>
            <fastboot-script src="baz.js"></fastboot-script>
            <script src="qux.js"></script>
          </body>
        </html>
      `,
    };

    fixturify.writeSync(tmpLocation, project);

    let { html } = htmlEntrypoint('my-app', tmpLocation, 'index.html');

    expect(html).to.be.equalHTML(`
      <html>
        <body>
          <script src="bar.js"></script>
          <script src="qux.js"></script>
        </body>
      </html>
    `);
  });

  it('can ignore scripts with data-fastboot-ignore', function() {
    let tmpobj = tmp.dirSync();
    let tmpLocation = tmpobj.name;

    let project = {
      'index.html': `
        <html>
          <body>
            <script src="foo.js"></script>
            <script data-fastboot-ignore src="bar.js"></script>
          </body>
        </html>
      `,
    };

    fixturify.writeSync(tmpLocation, project);

    let { html, scripts } = htmlEntrypoint('my-app', tmpLocation, 'index.html');

    expect(html).to.be.equalHTML(`
        <html>
          <body>
            <script src="foo.js"></script>
            <script src="bar.js"></script>
          </body>
        </html>
    `);
    expect(scripts).to.deep.equal([`${tmpLocation}/foo.js`]);
  });

  it('can use fastboot-specific src', function() {
    let tmpobj = tmp.dirSync();
    let tmpLocation = tmpobj.name;

    let project = {
      'index.html': `
        <html>
          <body>
            <script src="foo.js"></script>
            <script src="https://cdn.example.com/bar.js" data-fastboot-src="bar.js"></script>
          </body>
        </html>
      `,
    };

    fixturify.writeSync(tmpLocation, project);

    let { html, scripts } = htmlEntrypoint('my-app', tmpLocation, 'index.html');

    expect(html).to.be.equalHTML(`
        <html>
          <body>
            <script src="foo.js"></script>
            <script src="https://cdn.example.com/bar.js"></script>
          </body>
        </html>
    `);
    expect(scripts).to.deep.equal([`${tmpLocation}/foo.js`, `${tmpLocation}/bar.js`]);
  });

  it('gracefully ignores absolute URLs', function() {
    let tmpobj = tmp.dirSync();
    let tmpLocation = tmpobj.name;

    let project = {
      'index.html': `
        <html>
          <body>
            <script src="https://cdn.example.com/bar.js"></script>
          </body>
        </html>
      `,
    };

    fixturify.writeSync(tmpLocation, project);

    let { html, scripts } = htmlEntrypoint('my-app', tmpLocation, 'index.html');

    expect(html).to.be.equalHTML(`
        <html>
          <body>
            <script src="https://cdn.example.com/bar.js"></script>
          </body>
        </html>
    `);
    expect(scripts).to.deep.equal([]);
  });

  it('extracts configs from meta', function() {
    let tmpobj = tmp.dirSync();
    let tmpLocation = tmpobj.name;

    let project = {
      'index.html': `
        <html>
          <meta name="my-app/config/environment" content="%7B%22rootURL%22%3A%22%2Fcustom-root-url%2F%22%7D" >
          <body>
            <script src="/custom-root-url/bar.js"></script>
          </body>
        </html>
      `,
    };

    fixturify.writeSync(tmpLocation, project);
    let { config } = htmlEntrypoint('my-app', tmpLocation, 'index.html');
    expect(config).to.deep.equal({
      'my-app': { APP: { autoboot: false }, rootURL: '/custom-root-url/' },
    });
  });

  it('understands customized rootURL', function() {
    let tmpobj = tmp.dirSync();
    let tmpLocation = tmpobj.name;

    let project = {
      'index.html': `
        <html>
          <meta name="my-app/config/environment" content="%7B%22rootURL%22%3A%22%2Fcustom-root-url%2F%22%7D" >
          <body>
            <script src="/custom-root-url/bar.js"></script>
          </body>
        </html>
      `,
    };

    fixturify.writeSync(tmpLocation, project);

    let { scripts } = htmlEntrypoint('my-app', tmpLocation, 'index.html');
    expect(scripts).to.deep.equal([`${tmpLocation}/bar.js`]);
  });
});
