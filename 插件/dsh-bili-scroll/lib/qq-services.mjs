import {createWindowService} from './qq-window.mjs'
// Only the official QQ single-window adapter is instantiated.
export function createQqServices(options){
 const window=createWindowService(options)
 return {engine:'window',window,status:()=>window.status(),poll:()=>window.poll(),start:()=>window.start(),stop:()=>window.stop(),restart:()=>window.restart(),connection:()=>window.connection(),dispose:()=>window.dispose()}
}
