const { User } = require("../models/user.js");

module.exports = function(api)
{
    // get profile picture of a user
    api.get("/api/v1/users/:id/profile-picture", async (req, res, next) =>
    {
        try
        {
            let user = await User.findOne({ _id: req.params.id });
            if(!user)
                res.status(404).send({ error: "not found" });
            else
            {
                let picture = await user.getProfilePicture();
                res.set("Content-Type", `image/${picture.length > 400 ? "jpeg" : "svg+xml"}`).send(picture);
            }
        }
        catch(x) { next(x) }
    });
};
