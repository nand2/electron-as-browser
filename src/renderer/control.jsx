import React from 'react';
import ReactDOM from 'react-dom';
import cx from 'classnames';
import useConnect from '../../useConnect';
import * as action from '../../control';

const IconLoading = () => (
  <svg
    width="1em"
    height="1em"
    viewBox="0 0 38 38"
    xmlns="http://www.w3.org/2000/svg" stroke="black">
    <g fill="none" fillRule="evenodd">
      <g transform="translate(1 1)" strokeWidth="2">
        <circle strokeOpacity=".5" cx="18" cy="18" r="18"/>
        <path d="M36 18c0-9.94-8.06-18-18-18">
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 18 18"
            to="360 18 18"
            dur="1s"
            repeatCount="indefinite"/>
        </path>
      </g>
    </g>
  </svg>
);

const IconClose = () => (
  <svg
    viewBox="64 64 896 896"
    focusable="false"
    data-icon="close"
    width="1em"
    height="1em"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M563.8 512l262.5-312.9c4.4-5.2.7-13.1-6.1-13.1h-79.8c-4.7 0-9.2 2.1-12.3 5.7L511.6 449.8 295.1 191.7c-3-3.6-7.5-5.7-12.3-5.7H203c-6.8 0-10.5 7.9-6.1 13.1L459.4 512 196.9 824.9A7.95 7.95 0 0 0 203 838h79.8c4.7 0 9.2-2.1 12.3-5.7l216.5-258.1 216.5 258.1c3 3.6 7.5 5.7 12.3 5.7h79.8c6.8 0 10.5-7.9 6.1-13.1L563.8 512z" />
  </svg>
);

const IconPlus = () => (
  <svg
    viewBox="64 64 896 896"
    focusable="false"
    data-icon="plus"
    width="1em"
    height="1em"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M482 152h60q8 0 8 8v704q0 8-8 8h-60q-8 0-8-8V160q0-8 8-8z" />
    <path d="M176 474h672q8 0 8 8v60q0 8-8 8H176q-8 0-8-8v-60q0-8 8-8z" />
  </svg>
);

const IconReload = () => (
  <svg
    viewBox="64 64 896 896"
    focusable="false"
    data-icon="reload"
    width="1em"
    height="1em"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M909.1 209.3l-56.4 44.1C775.8 155.1 656.2 92 521.9 92 290 92 102.3 279.5 102 511.5 101.7 743.7 289.8 932 521.9 932c181.3 0 335.8-115 394.6-276.1 1.5-4.2-.7-8.9-4.9-10.3l-56.7-19.5a8 8 0 0 0-10.1 4.8c-1.8 5-3.8 10-5.9 14.9-17.3 41-42.1 77.8-73.7 109.4A344.77 344.77 0 0 1 655.9 829c-42.3 17.9-87.4 27-133.8 27-46.5 0-91.5-9.1-133.8-27A341.5 341.5 0 0 1 279 755.2a342.16 342.16 0 0 1-73.7-109.4c-17.9-42.4-27-87.4-27-133.9s9.1-91.5 27-133.9c17.3-41 42.1-77.8 73.7-109.4 31.6-31.6 68.4-56.4 109.3-73.8 42.3-17.9 87.4-27 133.8-27 46.5 0 91.5 9.1 133.8 27a341.5 341.5 0 0 1 109.3 73.8c9.9 9.9 19.2 20.4 27.8 31.4l-60.2 47a8 8 0 0 0 3 14.1l175.6 43c5 1.2 9.9-2.6 9.9-7.7l.8-180.9c-.1-6.6-7.8-10.3-13-6.2z" />
  </svg>
);

const IconLeft = () => (
  <svg
    viewBox="64 64 896 896"
    focusable="false"
    data-icon="left"
    width="1em"
    height="1em"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M724 218.3V141c0-6.7-7.7-10.4-12.9-6.3L260.3 486.8a31.86 31.86 0 0 0 0 50.3l450.8 352.1c5.3 4.1 12.9.4 12.9-6.3v-77.3c0-4.9-2.3-9.6-6.1-12.6l-360-281 360-281.1c3.8-3 6.1-7.7 6.1-12.6z" />
  </svg>
);

const IconRight = () => (
  <svg
    viewBox="64 64 896 896"
    focusable="false"
    data-icon="right"
    width="1em"
    height="1em"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M765.7 486.8L314.9 134.7A7.97 7.97 0 0 0 302 141v77.3c0 4.9 2.3 9.6 6.1 12.6l360 281.1-360 281.1c-3.9 3-6.1 7.7-6.1 12.6V883c0 6.7 7.7 10.4 12.9 6.3l450.8-352.1a31.96 31.96 0 0 0 0-50.4z" />
  </svg>
);

function Control() {
  const { tabs, setTabs, tabIDs, activeID, urlInputRef } = useConnect();

  const { canGoForward, canGoBack, isLoading } = tabs[activeID] || {};

  const onUrlChange = e => {
    // Update URL locally
    const v = e.target.value;
    let tabsCopy = Object.assign({}, tabs);
    tabsCopy[activeID].url = v;
    setTabs(tabsCopy)

    // Disabled : this used to reset cursor position at end at each key stroke
    // // Sync to tab config
    // action.sendChangeURL(v);
  };
  const onPressEnter = e => {
    if (e.keyCode !== 13) return;
    const v = e.target.value.trim();
    if (!v) return;

    let href = v;
    if (!/^.*?:\/\//.test(v)) {
      if(/^[a-z0-9-]+\.eth\/?/.test(v)) {
        href = `web3://${v}`;
      }
      else {
        href = `http://${v}`;
      }
    }

    // If we have a web3 url without the initial "/", add it
    // Otherwise break host relative links
    if (/^web3:\/\/[^\/]+$/.test(href)) {
      href = href + "/"
    }

    action.sendEnterURL(href);
  };
  const close = (e, id) => {
    e.stopPropagation();
    action.sendCloseTab(id);
  };
  const newTab = () => {
    action.sendNewTab();
  };
  const switchTab = id => {
    action.sendSwitchTab(id);
  };

  return (
    <div className="container">
      <div className="tabs">
        <>
          {tabIDs.map(id => {
            // eslint-disable-next-line no-shadow
            const { title, isLoading, favicon } = tabs[id] || {};
            return (
              <div
                key={id}
                className={cx('tab', { active: id === activeID })}
                onClick={() => switchTab(id)}
              >
                {isLoading ? <IconLoading /> : !!favicon && <img src={favicon} width="16" alt="" />}
                <div className="title">
                  <div className="title-content">{title}</div>
                </div>
                <div className="close" onClick={e => close(e, id)}>
                  <IconClose />
                </div>
              </div>
            );
          })}
          <span type="plus" style={{ marginLeft: 10 }} onClick={newTab}>
            <IconPlus />
          </span>
        </>
      </div>
      <div className="bars">
        <div className="bar address-bar">
          <div className="actions">
            <div
              className={cx('action', { disabled: !canGoBack })}
              onClick={canGoBack ? action.sendGoBack : undefined}
            >
              <IconLeft />
            </div>
            <div
              className={cx('action', { disabled: !canGoForward })}
              onClick={canGoForward ? action.sendGoForward : undefined}
            >
              <IconRight />
            </div>
            <div className={cx('action')} onClick={isLoading ? action.sendStop : action.sendReload}>
              {isLoading ? <IconClose /> : <IconReload />}
            </div>
          </div>
          <input
            className="address"
            value={tabs[activeID] !== undefined && tabs[activeID].url !== undefined ? tabs[activeID].url : ''}
            onChange={onUrlChange}
            onKeyDown={onPressEnter}
            ref={urlInputRef}
          />
        </div>
      </div>
    </div>
  );
}

// eslint-disable-next-line no-undef
ReactDOM.render(<Control />, document.getElementById('app'));
