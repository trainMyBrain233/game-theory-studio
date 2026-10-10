// Preserve native Canvas decoding/drawing. Only timing and injected decode
// failure are controlled, so a ready positive still requires complete assets.
export async function resolve(specifier,context,nextResolve){
 if(specifier==='@napi-rs/canvas'&&!context.parentURL?.startsWith('test-readiness:')){
  const native=await nextResolve(specifier,context);
  return {url:'test-readiness:'+encodeURIComponent(native.url),shortCircuit:true};
 }
 return nextResolve(specifier,context);
}
export async function load(url,context,nextLoad){
 if(url.startsWith('test-readiness:')){
  const native=JSON.stringify(decodeURIComponent(url.slice('test-readiness:'.length)));
  return {format:'module',shortCircuit:true,source:`
   export * from ${native};
   import {loadImage as nativeLoadImage} from ${native};
   export async function loadImage(...args){
    const control=globalThis.assetDecodeControl;
    if(control){control.calls++;if(control.calls===control.pauseAt)await control.gate;
     if(control.calls===control.failAt)throw Error('Injected late decode failure');}
    return nativeLoadImage(...args);
   }
  `};
 }
 return nextLoad(url,context);
}
