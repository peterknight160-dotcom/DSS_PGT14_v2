DSS Food Blog
This is the front-end for your DSS Blog. It has a "Login" page, a "Home" page, a "Posts" page, and a "My Posts" page. It includes
functional login, plus search, add, edit and delete of posts using local JSON files. You will update the functionality through the completion of your assignment.

---- Logging in -----
At the moment, logins are hardcoded. The username is "username" and the password is "password" in plaintext.

---- Handling posts -----
Posts can be searched using the search bar. See my_posts.js or posts.js for the function that handles this.
Posts can be edited or deleted from the "My Posts" page. Editing posts is handled by deleting the original post and inserting the new post in its place. See app.js for the POST request which handles this.

---- Loading posts -----
Posts are loaded from a local JSON file called posts.json. Posts are loaded on three different pages: "Home", "Posts", and "My Posts".