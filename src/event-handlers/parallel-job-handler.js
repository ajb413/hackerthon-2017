export default ( request ) => { 
    const kvstore = require('kvstore');
    const xhr = require('xhr');
    const pubnub = require('pubnub');
    
    // Publish a message here with "deljob" true to reset the kvstore
    if ( request.message.deljob ) {
        return kvstore.set("parallel_job", null, 86400)
        .then( () => {
            return request.ok();
        });
    }

    let assignTask = function ( jobObject ) {
        for ( let task of jobObject.tasks ) {
            let stale = isTaskStale(task, 15);
            if ( (!task.in_progress && !task.complete) ||
                 (task.in_progress && stale)
               ) {

                jobObject.params.nodes++;
                console.log(jobObject.params.node_uuids);
                jobObject.params.node_uuids[request.message.uuid] = 1;

                return pubnub.publish({
                    "channel": "brute-force",
                    "message": {
                        "type": "BruteForce",
                        "uuid": request.message.uuid,
                        "id": task.id,
                        "job_params": jobObject.params,
                        "task_params": task.params
                    }
                }).then( () => {
                    return Promise.resolve(jobObject);
                });
            }
        }
    };

    let updateTaskStatus = function ( jobObject ) {
        let taskStatus = request.message.task_status;
        let taskId = request.message.id;
        let result = request.message.result;

        for ( let task of jobObject.tasks ) {
            if ( task.id === taskId ) {
                if ( result ) {
                    task.result = result;
                    task.in_progress = false;
                    jobObject.complete = true;
                    jobObject.params.done_jobs++;
                }
                else if ( result === false ) {
                    task.result = result;
                    task.complete = true;
                    task.in_progress = false;
                    jobObject.params.done_jobs++;
                }
                else {
                    task.in_progress = true;
                    task.start = Date.now();
                }

                return Promise.resolve(jobObject);
            }
        }
    };

    // if the task is older than timeout (seconds) return true
    // determines if a node had died mid task
    let isTaskStale = function ( task, timeout ) {
        let result = false;

        if ( task.start ) {
            let time = Date.now();
            if ( time - task.start > timeout * 1000 ) {
                result = true;
            }
        }

        return result;
    };

    // min val -5000000000 max 5000000000
    // 10 tasks
    let generateNewParallelJob = function () {
        return new Promise( ( resolve, reject ) => {
            
            let parallelJob = {
                "start": Date.now(),
                "complete": false,
                "tasks": [],
                "params" : {
                    "password": generateNewPassword(8), // up to 8 chars
                    "start": Date.now(),
                    "done_jobs": 0,
                    "node_uuids": {}
                }
            };

            // Yields 20 tasks that can handle an 8 character password
            let minHash = -5000000000;
            let maxHash =  5000000000;
            let range   =   999999999;

            for ( let i = minHash, j = 1; i < maxHash; i += range+1, j++ ) {
                
                let task = {
                    "id": j,
                    "complete": false,
                    "in_progress": false,
                    "params" : {
                        "upper_bound": i + range,
                        "lower_bound": i
                    }
                };

                parallelJob.tasks.push(task);
            }

            resolve(parallelJob);
        });
    };

    let generateNewPassword = function ( length ) {
        let passwordLength = Math.floor(1 + (Math.random() * length));
        return randomString(passwordLength);
    };

    let randomString = function ( length ) {
        let text = "";
        let possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        for ( let i = 0; i < length; i++ ) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    };

    return kvstore.get("parallel_job")
    .then( ( jobObject ) => {
        if ( !jobObject || jobObject.complete ) {
            return generateNewParallelJob();
        }
        else {
            return Promise.resolve(jobObject);
        }
    })
    .then( ( jobObject ) => {
        if ( request.message.task_status ) {
            return updateTaskStatus(jobObject);
        }

        return Promise.resolve(jobObject);
    })
    .then( ( jobObject ) => {
        if ( request.message.user_status !== "busy" ) {
            return assignTask(jobObject);
        }
        
        return Promise.resolve(jobObject);
    })
    .then( ( jobObject ) => {
        console.log(jobObject);
        return kvstore.set("parallel_job", jobObject, 86400);
    })
    .then( () => {
        return request.ok();
    });
};