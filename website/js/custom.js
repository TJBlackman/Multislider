$(function(){
    // hide comments
    $('.hideComments').on('click', function(){
        var $btn = $(this),
            $parent = $btn.closest('.panel-body'),
            $comments = $parent.find('.comment');
        if (!$btn.hasClass('showComments')){
            $comments.fadeOut(250);
            $btn.addClass('showComments').text('Show Comments');
        } else if ($btn.hasClass('showComments')){
            $comments.fadeIn(250);
            $btn.removeClass('showComments').text('Hide Comments');
        }
    });

    // css panels
    $('.css-row').on('click','button[data-toggle="collapse"]', function(){
        var $btn = $(this),
            $attr = $btn.attr('data-target'),
            $target = $($attr);
        if ($target.hasClass('in')){
            $target.collapse('toggle');
            $btn.text($btn.text().replace('Hide','Show'));
        } else {
            $('.css-row').find('.collapse.in').removeClass('in');
            $btn.text($btn.text().replace('Show','Hide'));
            $btn.siblings('.btn').each(function(){
                var $newBtn = $(this);
                $newBtn.text($newBtn.text().replace('Hide','Show'));
            });
        }
    });


});
