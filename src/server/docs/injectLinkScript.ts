import "server-only";

// Sites like Figma and Jira refuse to render inside an iframe, so links leaving the dashboard's
// origin are reopened through window.open, which the desktop shell hands to the default browser.
// flow feature indexes link other worktrees' pages as file:// URLs, which an http page may not
// open; those are rewritten to this server's /api/doc route.
const LINK_SCRIPT = `document.addEventListener("click",function(e){var a=e.target&&e.target.closest?e.target.closest("a[href]"):null;if(!a||e.defaultPrevented)return;var u=new URL(a.getAttribute("href"),location.href);if(u.protocol==="file:"&&/\\.html?$/i.test(u.pathname)){e.preventDefault();location.href="/api/doc"+u.pathname+u.hash;return}if(u.origin===location.origin||!/^https?:$/.test(u.protocol))return;e.preventDefault();window.open(u.href,"_blank");},true);`;

// flow pages keep answers in localStorage under "flow:<page folder>". flow reads them from browser
// profiles on disk, which never include this app, so every write is mirrored to /api/flow-answers.
// Inside the dashboard panel the page's save bar also gets a button that asks the panel to hand the
// answers to the session that made the document.
const FLOW_SAVE_SCRIPT = `(function(){var P=Storage.prototype,set=P.setItem,del=P.removeItem,timer=null,pending=null,last=null;function mine(s){try{return s===window.localStorage}catch(e){return false}}function post(){var body=JSON.stringify({page:location.pathname,state:last});pending=null;return fetch("/api/flow-answers",{method:"POST",keepalive:true,headers:{"Content-Type":"application/json"},body:body}).catch(function(){})}function send(k,v){if(typeof k!=="string"||k.indexOf("flow:")!==0)return;last=v;pending=true;clearTimeout(timer);timer=setTimeout(post,400)}function flush(){clearTimeout(timer);return pending?post():Promise.resolve()}P.setItem=function(k,v){set.apply(this,arguments);if(mine(this))send(k,String(v))};P.removeItem=function(k){del.apply(this,arguments);if(mine(this))send(k,null)};if(window.parent===window)return;function decorate(bar){if(bar.hidden||!bar.querySelector("[data-undo]")||bar.querySelector("[data-send-claude]"))return;var how=bar.querySelector("span");if(how)how.lastChild.textContent="'Claude에게 보내기'를 누르면 이 문서를 만든 세션이 이어서 반영해요";var b=document.createElement("button");b.setAttribute("data-send-claude","");b.textContent="Claude에게 보내기";b.onclick=function(){b.disabled=true;b.textContent="보내는 중";flush().then(function(){window.parent.postMessage({type:"flow-answers-send",page:location.pathname},location.origin)})};bar.appendChild(b)}window.addEventListener("message",function(e){if(e.origin!==location.origin||!e.data||e.data.type!=="flow-answers-sent")return;var b=document.querySelector("[data-send-claude]");if(b){b.disabled=false;b.textContent=e.data.ok?"보냈어요":"Claude에게 보내기"}});document.addEventListener("DOMContentLoaded",function(){var bar=document.getElementById("savebar");if(!bar)return;decorate(bar);new MutationObserver(function(){decorate(bar)}).observe(bar,{childList:true,attributes:true,attributeFilter:["hidden"]})})})();`;

const SCRIPT = `<script>${LINK_SCRIPT}${FLOW_SAVE_SCRIPT}</script>`;

export function injectLinkScript(html: string): string {
  const head = html.search(/<head[^>]*>/i);
  if (head === -1) return SCRIPT + html;
  const end = html.indexOf(">", head) + 1;
  return html.slice(0, end) + SCRIPT + html.slice(end);
}
