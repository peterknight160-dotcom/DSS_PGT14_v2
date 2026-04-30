const fs = require('fs');
//seperate function logic for getting posts
async function getPosts(databaseName){
    const post_data = await databaseName.manyOrNone ('select postid as "postId", username , entrytime as "timestamp", title ,content from posts inner join  blogapp_admin.user_vw on blogapp_admin.user_vw.id= posts.userid');
    fs.writeFileSync(__dirname + '/public/json/posts.json', JSON.stringify(post_data));
};

module.exports = { getPosts }