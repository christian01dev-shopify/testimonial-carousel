(function ($) {
  "use strict";

  $(function () {
    var frame;
    var $avatarId = $("#tdm_avatar_id");
    var $preview = $(".tdm-avatar-preview");
    var $remove = $(".tdm-remove-avatar");

    $(".tdm-select-avatar").on("click", function (event) {
      event.preventDefault();
      if (frame) {
        frame.open();
        return;
      }

      frame = wp.media({
        title: "Select testimonial avatar",
        button: { text: "Use this image" },
        library: { type: "image" },
        multiple: false
      });

      frame.on("select", function () {
        var image = frame.state().get("selection").first().toJSON();
        var url = image.sizes && image.sizes.thumbnail ? image.sizes.thumbnail.url : image.url;
        $avatarId.val(image.id);
        $preview.html($("<img>", { src: url, alt: "", width: 80, height: 80 }));
        $remove.prop("hidden", false);
      });

      frame.open();
    });

    $remove.on("click", function (event) {
      event.preventDefault();
      $avatarId.val("");
      $preview.empty();
      $remove.prop("hidden", true);
    });
  });
})(jQuery);
