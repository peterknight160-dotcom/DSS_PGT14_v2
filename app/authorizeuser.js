//session middleware function to check if user is authorised
function authenticateUser(req, res, next){
    if (req.session.authenticated){
        return next();
    } else {
        res.status(403).send('You are not authenticated to view this page.')
    }
}

function checkContributor(req, res, next){
    //checks role if user exists
    if (req.session.user?.role === 'CONTRIBUTOR'){
        return next();
    } else{
        res.status(403).send('You are not authenticated to view this page.')
    }
}

module.exports = { authenticateUser, checkContributor }