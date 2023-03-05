 const {Spotify} = require("statisfy-browser");
 const config = require("./config.json");
 const spt = new Spotify({
	client_id:config.spotifyCID,
	client_secret:config.spotifyCS,
 });
 var getStats = async function (){
        const info =  await fetch(`https://ws.audioscrobbler.com/2.0/?method=user.gettoptracks&user=aspekts&limit=5&period=7day&api_key=4fbdd023fb9f3a2d4471128f7c29724d&format=json`).then(res => res.json());
		const tracks = info.toptracks.track;
        document.getElementById("top-tracks").innerHTML = "";
        for (let i = 0; i < tracks.length; i++) {
			const body =  await spt.search({query: tracks[i].artist.name + " " + tracks[i].name, type:"track", limit:1});
            const track = body.tracks.items[0];
            document.getElementById("top-tracks").innerHTML += `<br> <br><img src="https://aspekts.dev/img/${i+1}.png"> - <a href="${track.external_urls.spotify}"> ${tracks[i].name} by ${tracks[i].artist.name}</a><br><br><div class="spotify-embeds"><iframe src="https://open.spotify.com/embed/track/${track.id}" width="1000" height="80" frameborder="0" allowtransparency="true" allow="encrypted-media"></iframe></div>`;   
              };
        };
        getStats();



