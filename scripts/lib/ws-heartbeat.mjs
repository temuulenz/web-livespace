// RFC 6455 control frames only: never send JSON heartbeats as sensor telemetry.
// Mirrors OkHttp pingInterval: an unanswered ping at the next interval loses liveness.
export function startHeartbeat(socket,{intervalMs=30000,onTimeout=()=>{}}={}) {
 let pending=null,sequence=0,stopped=false;
 const pong=data=>{if(pending!==null && data.toString()===pending)pending=null;};
 const stop=()=>{if(stopped)return;stopped=true;clearInterval(timer);socket.off('pong',pong);socket.off('close',stop);};
 const timer=setInterval(()=>{
  if(socket.readyState!==1)return;
  if(pending!==null){stop();socket.terminate();onTimeout();return;}
  pending='ls-heartbeat-'+(++sequence);
  try{socket.ping(pending);}catch{stop();socket.terminate();onTimeout();}
 },intervalMs);
 timer.unref?.();socket.on('pong',pong);socket.once('close',stop);return stop;
}
