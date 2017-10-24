//Web Worker for Brute-Force

const hashCode = function ( str ) {
  var hash = 0;
  if (str.length == 0) return hash;
  for (i = 0; i < str.length; i++) {
    char = str.charCodeAt(i);
    hash = ((hash<<5)-hash)+char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash;
};

const crack = function ( message ) {
    let password = message.job_params.password;
    let upperBound = message.task_params.upper_bound;
    let lowerBound = message.task_params.lower_bound;

    let hash = hashCode(password);

    for ( let i = lowerBound; i <= upperBound; i++ ) {
      if ( i === hash ) {
        postMessage(true);
      }
    }

    postMessage(false);
}


self.addEventListener("message", function ( e ) {
  if ( e.data && e.data.crack ) {
    let message = e.data.message
    return crack(message);
  }
}, false);